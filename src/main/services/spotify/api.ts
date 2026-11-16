import type { TokenManager } from './tokens'

const API = 'https://api.spotify.com/v1'
const TIMEOUT_MS = 10_000
const ART_TARGET_WIDTH = 300
const DEFAULT_RETRY_MS = 5000
const MAX_RETRY_MS = 120_000

export interface Playback {
  title: string
  artist: string
  album: string
  artUrl: string | null
  isPlaying: boolean
  progressMs: number
  durationMs: number
  deviceName: string | null
}

type Problem = { kind: 'not-connected' } | { kind: 'no-client-id' } | { kind: 'reauth' } | { kind: 'rate-limited'; retryAfterMs: number } | { kind: 'error'; message: string }
export type PlaybackResult = { kind: 'ok'; playback: Playback } | { kind: 'idle' } | { kind: 'no-device' } | Problem
export type ControlResult = { kind: 'ok' } | { kind: 'premium' } | { kind: 'no-device' } | Problem
export type ControlAction = 'play' | 'pause' | 'next' | 'previous'

/** Pure mapping of GET /me/player. Only https cover URLs are trusted. */
export function parsePlayback(j: any): Playback | null {
  const item = j?.item
  if (!item || item.type !== 'track') return null
  const images = (Array.isArray(item.album?.images) ? item.album.images : []).filter(
    (i: any) => typeof i?.url === 'string' && i.url.startsWith('https://')
  )
  images.sort((a: any, b: any) => Math.abs((a.width ?? 0) - ART_TARGET_WIDTH) - Math.abs((b.width ?? 0) - ART_TARGET_WIDTH))
  return {
    title: String(item.name ?? ''),
    artist: (Array.isArray(item.artists) ? item.artists : []).map((a: any) => String(a?.name ?? '')).filter(Boolean).join(', '),
    album: String(item.album?.name ?? ''),
    artUrl: images[0]?.url ?? null,
    isPlaying: Boolean(j.is_playing),
    progressMs: Number(j.progress_ms) || 0,
    durationMs: Number(item.duration_ms) || 0,
    deviceName: typeof j.device?.name === 'string' ? j.device.name : null
  }
}

const retryAfterMs = (res: Response): number => {
  const s = Number(res.headers.get('retry-after'))
  return Number.isFinite(s) && s > 0 ? Math.min(Math.max(s * 1000, 1000), MAX_RETRY_MS) : DEFAULT_RETRY_MS
}

export function createSpotifyClient({ fetchImpl, tokens }: { fetchImpl: typeof fetch; tokens: Pick<TokenManager, 'getAccessToken' | 'invalidate'> }) {
  /** One authorised request; refreshes the token once on 401. Returns the Response or a ready-made problem. */
  async function request(method: string, path: string): Promise<Response | Problem> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const tok = await tokens.getAccessToken()
      if (!tok.ok) return tok.reason === 'network' ? { kind: 'error', message: 'Geen verbinding met Spotify.' } : { kind: tok.reason }
      let res: Response
      try {
        res = await fetchImpl(`${API}${path}`, { method, headers: { authorization: `Bearer ${tok.accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      } catch {
        return { kind: 'error', message: 'Geen verbinding met Spotify.' }
      }
      if (res.status === 401) {
        if (attempt === 0) { tokens.invalidate(); continue }
        return { kind: 'reauth' }
      }
      if (res.status === 429) return { kind: 'rate-limited', retryAfterMs: retryAfterMs(res) }
      return res
    }
    return { kind: 'reauth' }
  }
  const isResponse = (r: Response | Problem): r is Response => r instanceof Response

  return {
    async getPlayback(): Promise<PlaybackResult> {
      const r = await request('GET', '/me/player?additional_types=track')
      if (!isResponse(r)) return r
      if (r.status === 204) return { kind: 'no-device' }
      if (!r.ok) return { kind: 'error', message: `Spotify gaf een fout (HTTP ${r.status}).` }
      const playback = parsePlayback(await r.json().catch(() => null))
      return playback ? { kind: 'ok', playback } : { kind: 'idle' }
    },

    async control(action: ControlAction): Promise<ControlResult> {
      const method = action === 'next' || action === 'previous' ? 'POST' : 'PUT'
      const r = await request(method, `/me/player/${action}`)
      if (!isResponse(r)) return r
      if (r.ok) return { kind: 'ok' }
      const reason = await r.json().then((j: { error?: { reason?: string } }) => j?.error?.reason, () => undefined)
      if (r.status === 403 && reason === 'PREMIUM_REQUIRED') return { kind: 'premium' }
      if (r.status === 404 || reason === 'NO_ACTIVE_DEVICE') return { kind: 'no-device' }
      return { kind: 'error', message: `Bediening mislukt (HTTP ${r.status}).` }
    }
  }
}
