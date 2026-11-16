const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SKEW_MS = 60_000 // refresh a minute before expiry
const TIMEOUT_MS = 10_000

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
    let res: Response
    try {
      res = await post({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId })
    } catch {
      return { ok: false, reason: 'network' }
    }
    if (res.status === 400 || res.status === 401) {
      const err = await res.json().then((j: { error?: string }) => j?.error, () => undefined)
      if (err === 'invalid_grant') { // revoked or expired: the stored token is useless, forget it
        access = null
        await store.set(null)
      }
      return { ok: false, reason: 'reauth' }
    }
    if (!res.ok) return { ok: false, reason: 'network' }
    const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; refresh_token?: string } | null
    if (!j?.access_token) return { ok: false, reason: 'network' }
    access = { token: j.access_token, expiresAt: now() + (j.expires_in ?? 3600) * 1000 }
    if (j.refresh_token && j.refresh_token !== refreshToken) await store.set(j.refresh_token)
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
      const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; refresh_token?: string } | null
      if (!res.ok || !j?.access_token || !j.refresh_token) return { ok: false, error: `Spotify weigerde de verbinding (HTTP ${res.status}). Controleer Client ID en redirect-URI.` }
      access = { token: j.access_token, expiresAt: now() + (j.expires_in ?? 3600) * 1000 }
      await store.set(j.refresh_token)
      return { ok: true }
    },

    async getAccessToken(): Promise<TokenResult> {
      if (!getClientId()) return { ok: false, reason: 'no-client-id' }
      if (!store.has()) return { ok: false, reason: 'not-connected' }
      if (access && now() < access.expiresAt - SKEW_MS) return { ok: true, accessToken: access.token }
      inflight ??= refresh().finally(() => { inflight = null }) // concurrent callers share one refresh
      return inflight
    },

    /** The API said 401: drop the cached access token so the next call refreshes. */
    invalidate(): void { access = null },

    async disconnect(): Promise<void> {
      access = null
      await store.set(null)
    }
  }
}

export type TokenManager = ReturnType<typeof createTokenManager>
