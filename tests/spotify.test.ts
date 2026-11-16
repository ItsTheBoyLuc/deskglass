import { describe, expect, it, vi } from 'vitest'
import { SPOTIFY_SCOPES, buildAuthUrl, challengeFor, createState, createVerifier, redirectUriFor } from '../src/main/services/spotify/pkce'
import { createTokenManager } from '../src/main/services/spotify/tokens'
import type { TokenStore } from '../src/main/services/spotify/tokens'
import { createSpotifyClient, parsePlayback } from '../src/main/services/spotify/api'
import { runAuthFlow } from '../src/main/services/spotify/connect'

const CLIENT_ID = '0123456789abcdef0123456789abcdef'

const reply = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers })

function memoryStore(initial: string | null = null): TokenStore & { value: string | null } {
  const s = { value: initial, get: async () => s.value, set: async (v: string | null) => { s.value = v }, has: () => s.value !== null }
  return s
}

describe('PKCE', () => {
  it('matches the RFC 7636 test vector', () => {
    expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('creates URL-safe verifiers of valid length, different each time', () => {
    const a = createVerifier()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(createVerifier()).not.toBe(a)
    expect(createState()).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  })
  it('builds the authorize URL with PKCE, loopback redirect and the three scopes (no secret)', () => {
    const u = new URL(buildAuthUrl({ clientId: CLIENT_ID, redirectUri: redirectUriFor(8898), challenge: 'CH', state: 'ST' }))
    expect(u.origin + u.pathname).toBe('https://accounts.spotify.com/authorize')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(u.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8898/callback')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('code_challenge')).toBe('CH')
    expect(u.searchParams.get('state')).toBe('ST')
    expect(u.searchParams.get('scope')!.split(' ').sort()).toEqual([...SPOTIFY_SCOPES].sort())
    expect(u.search).not.toMatch(/secret/i)
  })
})

describe('token manager', () => {
  const make = (fetchImpl: typeof fetch, store = memoryStore('RT1'), now = () => 1_000_000, clientId = CLIENT_ID) =>
    ({ store, tm: createTokenManager({ fetchImpl, store, getClientId: () => clientId, now }) })

  it('exchanges the code (form body with verifier, never a client secret) and stores the refresh token', async () => {
    const f = vi.fn(async (_u: unknown, _init?: RequestInit) => reply(200, { access_token: 'AT', expires_in: 3600, refresh_token: 'RT-new' }))
    const { tm, store } = make(f as unknown as typeof fetch, memoryStore(null))
    expect(await tm.exchangeCode('CODE', 'VERIFIER', 'http://127.0.0.1:8898/callback')).toEqual({ ok: true })
    const body = new URLSearchParams(String((f.mock.calls[0]![1] as RequestInit).body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code_verifier')).toBe('VERIFIER')
    expect(body.get('client_id')).toBe(CLIENT_ID)
    expect(body.has('client_secret')).toBe(false)
    expect(store.value).toBe('RT-new')
  })

  it('caches the access token until shortly before it expires, then refreshes', async () => {
    let t = 1_000_000
    const f = vi.fn(async () => reply(200, { access_token: `AT${f.mock.calls.length}`, expires_in: 3600 }))
    const { tm } = make(f as unknown as typeof fetch, memoryStore('RT1'), () => t)
    expect(await tm.getAccessToken()).toEqual({ ok: true, accessToken: 'AT1' })
    t += 3000 * 1000
    expect(await tm.getAccessToken()).toEqual({ ok: true, accessToken: 'AT1' })
    expect(f).toHaveBeenCalledTimes(1)
    t += 600 * 1000 // inside the 60 s safety margin of expiry
    expect(await tm.getAccessToken()).toEqual({ ok: true, accessToken: 'AT2' })
  })

  it('keeps the old refresh token when Spotify does not rotate it, and uses the new one when it does', async () => {
    const f = vi.fn(async () => reply(200, { access_token: 'AT', expires_in: 3600 }))
    const a = make(f as unknown as typeof fetch)
    await a.tm.getAccessToken()
    expect(a.store.value).toBe('RT1')
    const g = vi.fn(async () => reply(200, { access_token: 'AT', expires_in: 3600, refresh_token: 'RT2' }))
    const b = make(g as unknown as typeof fetch)
    await b.tm.getAccessToken()
    expect(b.store.value).toBe('RT2')
  })

  it('treats invalid_grant as revoked: deletes the stored token and asks to reconnect', async () => {
    const f = async () => reply(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' })
    const { tm, store } = make(f as unknown as typeof fetch)
    expect(await tm.getAccessToken()).toEqual({ ok: false, reason: 'reauth' })
    expect(store.value).toBeNull()
  })

  it('keeps the token on network errors and server errors', async () => {
    const down = make((async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch)
    expect(await down.tm.getAccessToken()).toEqual({ ok: false, reason: 'network' })
    expect(down.store.value).toBe('RT1')
    const err = make((async () => reply(503)) as unknown as typeof fetch)
    expect(await err.tm.getAccessToken()).toEqual({ ok: false, reason: 'network' })
    expect(err.store.value).toBe('RT1')
  })

  it('reports not-connected / no-client-id without calling the network', async () => {
    const f = vi.fn()
    expect(await make(f as unknown as typeof fetch, memoryStore(null)).tm.getAccessToken()).toEqual({ ok: false, reason: 'not-connected' })
    expect(await make(f as unknown as typeof fetch, memoryStore('RT1'), () => 0, '').tm.getAccessToken()).toEqual({ ok: false, reason: 'no-client-id' })
    expect(f).not.toHaveBeenCalled()
  })

  it('shares one refresh between concurrent callers', async () => {
    const f = vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); return reply(200, { access_token: 'AT', expires_in: 3600 }) })
    const { tm } = make(f as unknown as typeof fetch)
    await Promise.all([tm.getAccessToken(), tm.getAccessToken(), tm.getAccessToken()])
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('disconnect deletes the stored token', async () => {
    const { tm, store } = make((async () => reply(200)) as unknown as typeof fetch)
    await tm.disconnect()
    expect(store.value).toBeNull()
    expect(await tm.getAccessToken()).toEqual({ ok: false, reason: 'not-connected' })
  })
})

const PLAYBACK = {
  is_playing: true,
  progress_ms: 61_000,
  device: { name: 'Mijn PC' },
  item: {
    type: 'track', name: 'Song', duration_ms: 200_000,
    artists: [{ name: 'A' }, { name: 'B' }],
    album: { name: 'Album', images: [{ url: 'https://i.scdn.co/big', width: 640 }, { url: 'https://i.scdn.co/mid', width: 300 }, { url: 'https://i.scdn.co/small', width: 64 }] }
  }
}

describe('parsePlayback', () => {
  it('maps a track, joins artists and picks a mid-size cover', () => {
    expect(parsePlayback(PLAYBACK)).toEqual({
      title: 'Song', artist: 'A, B', album: 'Album', artUrl: 'https://i.scdn.co/mid',
      isPlaying: true, progressMs: 61_000, durationMs: 200_000, deviceName: 'Mijn PC'
    })
  })
  it('returns null when nothing (or an unsupported item) is playing', () => {
    expect(parsePlayback({ is_playing: false, item: null })).toBeNull()
    expect(parsePlayback(null)).toBeNull()
    expect(parsePlayback({ item: { type: 'ad' } })).toBeNull()
  })
  it('only trusts https image URLs', () => {
    const p = parsePlayback({ ...PLAYBACK, item: { ...PLAYBACK.item, album: { name: 'x', images: [{ url: 'http://evil/x.jpg', width: 300 }] } } })
    expect(p?.artUrl).toBeNull()
  })
})

describe('spotify client', () => {
  const tokens = () => {
    let n = 0
    return { getAccessToken: vi.fn(async () => ({ ok: true as const, accessToken: `AT${++n}` })), invalidate: vi.fn() }
  }
  const client = (fetchImpl: typeof fetch, tk = tokens()) => ({ tk, c: createSpotifyClient({ fetchImpl, tokens: tk as never }) })

  it('returns playback with a bearer token', async () => {
    const f = vi.fn(async (_u: unknown, _i?: RequestInit) => reply(200, PLAYBACK))
    const { c } = client(f as unknown as typeof fetch)
    const r = await c.getPlayback()
    expect(r.kind).toBe('ok')
    expect(((f.mock.calls[0]![1] as RequestInit).headers as Record<string, string>).authorization).toBe('Bearer AT1')
  })
  it('maps 204 to "no active device"', async () => {
    expect((await client((async () => reply(204)) as unknown as typeof fetch).c.getPlayback()).kind).toBe('no-device')
  })
  it('maps a 200 without item to idle', async () => {
    expect((await client((async () => reply(200, { is_playing: false, item: null })) as unknown as typeof fetch).c.getPlayback()).kind).toBe('idle')
  })
  it('refreshes once on 401 and retries', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200, PLAYBACK))
    const { c, tk } = client(f as unknown as typeof fetch)
    expect((await c.getPlayback()).kind).toBe('ok')
    expect(tk.invalidate).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('asks to reconnect when 401 persists', async () => {
    const f = vi.fn(async () => reply(401))
    expect((await client(f as unknown as typeof fetch).c.getPlayback()).kind).toBe('reauth')
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('honors Retry-After on 429 (seconds -> ms)', async () => {
    const r = await client((async () => reply(429, undefined, { 'retry-after': '7' })) as unknown as typeof fetch).c.getPlayback()
    expect(r).toEqual({ kind: 'rate-limited', retryAfterMs: 7000 })
  })
  it('falls back to a sane default when Retry-After is missing or absurd', async () => {
    const a = await client((async () => reply(429)) as unknown as typeof fetch).c.getPlayback()
    expect(a.kind === 'rate-limited' && a.retryAfterMs >= 1000 && a.retryAfterMs <= 120_000).toBe(true)
    const b = await client((async () => reply(429, undefined, { 'retry-after': '999999' })) as unknown as typeof fetch).c.getPlayback()
    expect(b.kind === 'rate-limited' && b.retryAfterMs <= 120_000).toBe(true)
  })
  it('maps server errors and network failures to an error result', async () => {
    expect((await client((async () => reply(500)) as unknown as typeof fetch).c.getPlayback()).kind).toBe('error')
    expect((await client((async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch).c.getPlayback()).kind).toBe('error')
  })
  it('passes through token problems without calling the API', async () => {
    const tk = { getAccessToken: async () => ({ ok: false as const, reason: 'not-connected' as const }), invalidate: vi.fn() }
    const f = vi.fn()
    expect((await createSpotifyClient({ fetchImpl: f as unknown as typeof fetch, tokens: tk as never }).getPlayback()).kind).toBe('not-connected')
    expect(f).not.toHaveBeenCalled()
  })

  it('sends the right control requests', async () => {
    const f = vi.fn(async (_u: unknown, _i?: RequestInit) => reply(204))
    const { c } = client(f as unknown as typeof fetch)
    for (const a of ['play', 'pause', 'next', 'previous'] as const) expect(await c.control(a)).toEqual({ kind: 'ok' })
    const calls = f.mock.calls.map((x) => `${(x[1] as RequestInit).method} ${new URL(String(x[0])).pathname}`)
    expect(calls).toEqual(['PUT /v1/me/player/play', 'PUT /v1/me/player/pause', 'POST /v1/me/player/next', 'POST /v1/me/player/previous'])
  })
  it('maps non-Premium (403 PREMIUM_REQUIRED) and no device (404)', async () => {
    const prem = client((async () => reply(403, { error: { status: 403, reason: 'PREMIUM_REQUIRED', message: 'Player command failed: Premium required' } })) as unknown as typeof fetch)
    expect(await prem.c.control('pause')).toEqual({ kind: 'premium' })
    const nod = client((async () => reply(404, { error: { status: 404, reason: 'NO_ACTIVE_DEVICE' } })) as unknown as typeof fetch)
    expect(await nod.c.control('next')).toEqual({ kind: 'no-device' })
  })
})

describe('auth flow (loopback callback)', () => {
  const until = async (fn: () => unknown) => { for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 10)) }
  const start = (exchange: Parameters<typeof runAuthFlow>[0]['exchange'], timeoutMs = 3000) => {
    let opened = ''
    const done = runAuthFlow({ clientId: CLIENT_ID, openUrl: (u) => { opened = u }, exchange, port: 0, timeoutMs })
    return { done, opened: async () => { await until(() => opened); return new URL(opened) } }
  }

  it('completes when the browser returns to the callback with the right state', async () => {
    const exchange = vi.fn(async (_c: string, _v: string, _r: string) => ({ ok: true as const }))
    const { done, opened } = start(exchange)
    const u = await opened()
    const res = await fetch(`${u.searchParams.get('redirect_uri')}?code=THECODE&state=${u.searchParams.get('state')}`)
    expect(res.status).toBe(200)
    expect(await done).toEqual({ ok: true })
    expect(exchange).toHaveBeenCalledWith('THECODE', expect.stringMatching(/^[A-Za-z0-9_-]{43,}$/), u.searchParams.get('redirect_uri'))
  })

  it('rejects a callback with the wrong state and keeps waiting', async () => {
    const exchange = vi.fn(async (_c: string, _v: string, _r: string) => ({ ok: true as const }))
    const { done, opened } = start(exchange)
    const u = await opened()
    const redirect = u.searchParams.get('redirect_uri')
    expect((await fetch(`${redirect}?code=EVIL&state=WRONG`)).status).toBe(400)
    expect(exchange).not.toHaveBeenCalled()
    await fetch(`${redirect}?code=OK&state=${u.searchParams.get('state')}`)
    expect(await done).toEqual({ ok: true })
  })

  it('reports a denied authorisation', async () => {
    const { done, opened } = start(async () => ({ ok: true as const }))
    const u = await opened()
    await fetch(`${u.searchParams.get('redirect_uri')}?error=access_denied&state=${u.searchParams.get('state')}`)
    expect((await done).ok).toBe(false)
  })

  it('passes a failed token exchange on', async () => {
    const { done, opened } = start(async () => ({ ok: false as const, error: 'Spotify weigerde de code' }))
    const u = await opened()
    await fetch(`${u.searchParams.get('redirect_uri')}?code=X&state=${u.searchParams.get('state')}`)
    expect(await done).toEqual({ ok: false, error: 'Spotify weigerde de code' })
  })

  it('times out and frees the port', async () => {
    const { done } = start(async () => ({ ok: true as const }), 100)
    expect((await done).ok).toBe(false)
  })

  it('tells the user when the fixed port is already taken', async () => {
    const first = start(async () => ({ ok: true as const }), 500)
    const u = await first.opened()
    const port = Number(new URL(u.searchParams.get('redirect_uri')!).port)
    const second = await runAuthFlow({ clientId: CLIENT_ID, openUrl: () => {}, exchange: async () => ({ ok: true }), port, timeoutMs: 200 })
    expect(second.ok).toBe(false)
    expect(!second.ok && second.error).toMatch(/poort/i)
    await first.done
  })

  it('only serves the /callback path', async () => {
    const { done, opened } = start(async () => ({ ok: true as const }), 400)
    const u = await opened()
    const origin = new URL(u.searchParams.get('redirect_uri')!).origin
    expect((await fetch(`${origin}/other?code=1&state=${u.searchParams.get('state')}`)).status).toBe(404)
    await done
  })
})
