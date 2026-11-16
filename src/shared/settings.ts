import { WIDGET_IDS } from './types'
import type { ChatMode, ChatProvider, DesktopMode, Settings, WebProvider } from './types'

export const DEFAULT_SETTINGS: Settings = {
  enabled: { clock: true, stats: true, weather: true, agenda: true, music: true, chat: true },
  locked: false,
  clockSeconds: false,
  clockHour12: false,
  city: 'Amsterdam',
  chat: { mode: 'web', webProvider: 'claude', provider: 'anthropic', model: 'claude-sonnet-5-5', baseUrl: 'http://localhost:11434/v1' },
  spotifyClientId: '',
  desktopMode: 'auto'
}

const PROVIDERS: readonly ChatProvider[] = ['anthropic', 'openai-compat']
const MODES: readonly DesktopMode[] = ['auto', 'workerw', 'bottom']
const CHAT_MODES: readonly ChatMode[] = ['web', 'api']
const WEB_PROVIDERS: readonly WebProvider[] = ['claude', 'chatgpt', 'gemini']
const SPOTIFY_ID = /^[0-9a-f]{32}$/i
const MAX_CITY = 80
const MAX_MODEL = 120

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Returns a clean http(s) URL without trailing slash, or null. */
export function cleanHttpUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (u.username || u.password) return null // credentials in a URL would be stored in plaintext
    return u.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

/**
 * Trust boundary for settings coming from the renderer: unknown keys and wrong types are
 * dropped, strings are trimmed and length-limited. Never mutates `base`.
 */
export function applySettingsPatch(base: Settings, patch: unknown): Settings {
  if (!isRecord(patch)) return base
  const enabled = { ...base.enabled }
  if (isRecord(patch.enabled)) {
    for (const id of WIDGET_IDS) {
      const v = patch.enabled[id]
      if (typeof v === 'boolean') enabled[id] = v
    }
  }
  const chat = { ...base.chat }
  if (isRecord(patch.chat)) {
    const p = patch.chat
    if (CHAT_MODES.includes(p.mode as ChatMode)) chat.mode = p.mode as ChatMode
    if (WEB_PROVIDERS.includes(p.webProvider as WebProvider)) chat.webProvider = p.webProvider as WebProvider
    if (PROVIDERS.includes(p.provider as ChatProvider)) chat.provider = p.provider as ChatProvider
    if (typeof p.model === 'string' && p.model.trim()) chat.model = p.model.trim().slice(0, MAX_MODEL)
    const url = cleanHttpUrl(p.baseUrl)
    if (url) chat.baseUrl = url
  }
  const city = typeof patch.city === 'string' && patch.city.trim() ? patch.city.trim().slice(0, MAX_CITY) : base.city
  let spotifyClientId = base.spotifyClientId
  if (typeof patch.spotifyClientId === 'string') {
    const v = patch.spotifyClientId.trim()
    spotifyClientId = SPOTIFY_ID.test(v) ? v : ''
  }
  return {
    enabled,
    chat,
    spotifyClientId,
    city,
    locked: typeof patch.locked === 'boolean' ? patch.locked : base.locked,
    clockSeconds: typeof patch.clockSeconds === 'boolean' ? patch.clockSeconds : base.clockSeconds,
    clockHour12: typeof patch.clockHour12 === 'boolean' ? patch.clockHour12 : base.clockHour12,
    desktopMode: MODES.includes(patch.desktopMode as DesktopMode) ? (patch.desktopMode as DesktopMode) : base.desktopMode
  }
}
