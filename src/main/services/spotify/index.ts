import { shell } from 'electron'
import type { ControlAction } from './api'
import type { MusicState } from '../../../shared/types'
import { getSettings, secrets } from '../../store'
import { createSpotifyClient } from './api'
import { loadArt } from './art'
import { runAuthFlow } from './connect'
import type { FlowResult } from './connect'
import { createTokenManager } from './tokens'

const tokens = createTokenManager({
  fetchImpl: fetch,
  store: {
    get: () => secrets.get('spotifyRefreshToken'),
    set: (v) => secrets.set('spotifyRefreshToken', v ?? ''), // empty string deletes
    has: () => secrets.has('spotifyRefreshToken')
  },
  getClientId: () => getSettings().spotifyClientId,
  now: Date.now
})
const client = createSpotifyClient({ fetchImpl: fetch, tokens })

let last: MusicState = { status: 'disconnected' }
let backoffUntil = 0
let premiumOnly = false // set when a control call was refused for a free account; cleared on (re)connect

const withNotice = (s: MusicState, notice?: string): MusicState => {
  const n = notice ?? (premiumOnly && s.status === 'playing' ? 'Bediening vereist Spotify Premium: alleen weergave.' : undefined)
  return n ? { ...s, notice: n } : s
}

/** One poll of the player. Honors 429 Retry-After by returning the last state until the back-off has passed. */
export async function pollMusic(): Promise<MusicState> {
  if (Date.now() < backoffUntil) return last
  const r = await client.getPlayback()
  switch (r.kind) {
    case 'ok': {
      const art = await loadArt(r.playback.artUrl)
      last = withNotice({
        status: 'playing',
        track: { ...r.playback, artDataUrl: art?.dataUrl ?? null, accent: art?.accent ?? null, fetchedAt: Date.now() }
      })
      break
    }
    case 'rate-limited':
      backoffUntil = Date.now() + r.retryAfterMs
      return { ...last, notice: 'Spotify vraagt even te wachten…' }
    case 'error': last = { status: 'error', message: r.message }; break
    case 'idle': last = { status: 'idle' }; break
    case 'no-device': last = { status: 'no-device' }; break
    default: last = { status: r.kind === 'not-connected' ? 'disconnected' : r.kind } // no-client-id | reauth
  }
  return last
}

export async function musicControl(action: ControlAction): Promise<MusicState> {
  const r = await client.control(action)
  switch (r.kind) {
    case 'ok': backoffUntil = 0; return pollMusic()
    case 'premium':
      premiumOnly = true
      return withNotice(last, 'Bediening vereist Spotify Premium: alleen weergave.')
    case 'no-device': return { status: 'no-device' }
    case 'rate-limited':
      backoffUntil = Date.now() + r.retryAfterMs
      return { ...last, notice: 'Spotify vraagt even te wachten…' }
    case 'error': return withNotice(last, r.message)
    default: last = { status: r.kind === 'not-connected' ? 'disconnected' : r.kind }; return last
  }
}

export const getMusicState = (): MusicState => last

export async function connectSpotify(): Promise<FlowResult> {
  const clientId = getSettings().spotifyClientId
  if (!clientId) return { ok: false, error: 'Vul eerst je Spotify Client ID in en sla op.' }
  const r = await runAuthFlow({
    clientId,
    openUrl: (url) => { if (url.startsWith('https://accounts.spotify.com/')) void shell.openExternal(url) },
    exchange: (code, verifier, redirectUri) => tokens.exchangeCode(code, verifier, redirectUri)
  })
  if (r.ok) { premiumOnly = false; backoffUntil = 0; last = { status: 'idle' } }
  return r
}

export async function disconnectSpotify(): Promise<void> {
  await tokens.disconnect()
  premiumOnly = false
  last = { status: 'disconnected' }
}
