const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SKEW_MS = 60_000 // refresh a minute before expiry
const TIMEOUT_MS = 10_000
const BACKOFF_NETWORK_MS = 5000
const BACKOFF_5XX_MS = 15_000
const BACKOFF_429_MS = 30_000
const MAX_BACKOFF_MS = 120_000

/** Where the refresh token lives (encrypted with safeStorage in the app; in memory in tests). */
export interface TokenStore {
  get(): Promise<string | null>
  set(value: string | null): Promise<void>
  has(): boolean
}

export type TokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: 'not-connected' | 'no-client-id' | 'reauth' | 'network' }

export interface TokenDeps {
  fetchImpl: typeof fetch
  store: TokenStore
  getClientId: () => string
  now: () => number
}

/**
 * Authorization Code + PKCE token handling. There is no client secret anywhere. The access token only lives in
 * memory; the refresh token goes to the store. Neither is ever logged or put in an error message.
 */
export function createTokenManager({ fetchImpl, store, getClientId, now }: TokenDeps) {
  let access: { token: string; expiresAt: number } | null = null
  let inflight: Promise<TokenResult> | null = null
  let generation = 0 // bumped by disconnect(): results of older in-flight calls are discarded
  let blockedUntil = 0 // after 429/5xx/network errors do not hammer the token endpoint

  const post = (params: Record<string, string>): Promise<Response> =>
    fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })

  async function refresh(): Promise<TokenResult> {
    const clientId = getClientId()
    if (!clientId) return { ok: false, reason: 'no-client-id' }
    const refreshToken = await store.get()
    if (!refreshToken) return { ok: false, reason: 'not-connected' }
    const gen = generation
    let res: Response
    try {
      res = await post({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId })
    } catch {
      blockedUntil = now() + BACKOFF_NETWORK_MS
      return { ok: false, reason: 'network' }
    }
    if (gen !== generation) return { ok: false, reason: 'not-connected' } // disconnected while we were waiting
    if (res.status === 400 || res.status === 401) {
      const err = await res.json().then((j: { error?: string }) => j?.error, () => undefined)
      if (err === 'invalid_grant' && gen === generation) { // revoked or expired: forget it (unless a newer connect replaced it meanwhile)
        access = null
        await store.set(null)
      }
      return { ok: false, reason: 'reauth' }
    }
    if (!res.ok) {
      const retry = Number(res.headers.get('retry-after'))
      const wait = res.status === 429 && Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000, MAX_BACKOFF_MS) : res.status === 429 ? BACKOFF_429_MS : BACKOFF_5XX_MS
      blockedUntil = now() + wait
      return { ok: false, reason: 'network' }
    }
    const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; refresh_token?: string } | null
    if (!j?.access_token) return { ok: false, reason: 'network' }
    if (gen !== generation) return { ok: false, reason: 'not-connected' }
    access = { token: j.access_token, expiresAt: now() + (j.expires_in ?? 3600) * 1000 }
    if (j.refresh_token && j.refresh_token !== refreshToken) await store.set(j.refresh_token).catch(() => {}) // keep working with the valid access token even if saving the rotation fails
    return { ok: true, accessToken: access.token }
  }

  return {
    isConnected: (): boolean => store.has(),

    async exchangeCode(code: string, verifier: string, redirectUri: string): Promise<{ ok: true } | { ok: false; error: string }> {
      const clientId = getClientId()
      if (!clientId) return { ok: false, error: 'Vul eerst je Spotify Client ID in.' }
      let res: Response
      try {
        res = await post({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier })
      } catch {
        return { ok: false, error: 'Geen verbinding met Spotify.' }
      }
      const gen = generation
      const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; refresh_token?: string } | null
      if (gen !== generation) return { ok: false, error: 'Verbinding geannuleerd.' }
      if (!res.ok || !j?.access_token || !j.refresh_token) return { ok: false, error: `Spotify weigerde de verbinding (HTTP ${res.status}). Controleer Client ID en redirect-URI.` }
      generation++ // a refresh that started before this (re)connect must not touch the new token
      access = { token: j.access_token, expiresAt: now() + (j.expires_in ?? 3600) * 1000 }
      await store.set(j.refresh_token)
      return { ok: true }
    },

    async getAccessToken(): Promise<TokenResult> {
      if (!getClientId()) return { ok: false, reason: 'no-client-id' }
      if (!store.has()) return { ok: false, reason: 'not-connected' }
      if (access && now() < access.expiresAt - SKEW_MS) return { ok: true, accessToken: access.token }
      if (now() < blockedUntil) return { ok: false, reason: 'network' }
      inflight ??= refresh().finally(() => { inflight = null }) // concurrent callers share one refresh
      return inflight
    },

    /** The API said 401: drop the cached access token so the next call refreshes. */
    invalidate(): void { access = null },

    async disconnect(): Promise<void> {
      generation++
      access = null
      blockedUntil = 0
      await store.set(null)
    }
  }
}

export type TokenManager = ReturnType<typeof createTokenManager>
