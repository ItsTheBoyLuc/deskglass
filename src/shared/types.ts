export const WIDGET_IDS = ['clock', 'stats', 'weather', 'agenda', 'music', 'chat'] as const
export type WidgetId = (typeof WIDGET_IDS)[number]

export const WIDGET_TITLES: Record<WidgetId, string> = {
  clock: 'Klok',
  stats: 'Systeem',
  weather: 'Weer',
  agenda: 'Agenda & taken',
  music: 'Muziek',
  chat: 'AI-chat'
}

export const WIDGET_SIZES: Record<WidgetId, { width: number; height: number }> = {
  clock: { width: 300, height: 150 },
  stats: { width: 300, height: 320 },
  weather: { width: 300, height: 270 },
  agenda: { width: 340, height: 400 },
  music: { width: 360, height: 150 },
  chat: { width: 380, height: 480 }
}

export type SizePreset = 'S' | 'M' | 'L'
export const SIZE_PRESETS: readonly SizePreset[] = ['S', 'M', 'L']

/** S / M / L sizes per widget (M = default). */
export const WIDGET_PRESETS: Record<WidgetId, Record<SizePreset, { width: number; height: number }>> = {
  clock: { S: { width: 220, height: 110 }, M: WIDGET_SIZES.clock, L: { width: 420, height: 200 } },
  stats: { S: { width: 260, height: 260 }, M: WIDGET_SIZES.stats, L: { width: 360, height: 400 } },
  weather: { S: { width: 260, height: 230 }, M: WIDGET_SIZES.weather, L: { width: 380, height: 340 } },
  agenda: { S: { width: 300, height: 340 }, M: WIDGET_SIZES.agenda, L: { width: 440, height: 560 } },
  music: { S: { width: 300, height: 110 }, M: WIDGET_SIZES.music, L: { width: 480, height: 200 } },
  chat: { S: { width: 320, height: 380 }, M: WIDGET_SIZES.chat, L: { width: 520, height: 680 } }
}

/** Resize limits per widget: below min the content would clip, above max it is pointless. */
export const WIDGET_LIMITS: Record<WidgetId, { min: { width: number; height: number }; max: { width: number; height: number } }> = {
  clock: { min: { width: 180, height: 90 }, max: { width: 640, height: 320 } },
  stats: { min: { width: 240, height: 220 }, max: { width: 560, height: 640 } },
  weather: { min: { width: 240, height: 200 }, max: { width: 560, height: 520 } },
  agenda: { min: { width: 280, height: 300 }, max: { width: 700, height: 900 } },
  music: { min: { width: 260, height: 100 }, max: { width: 700, height: 300 } },
  chat: { min: { width: 300, height: 320 }, max: { width: 1000, height: 1000 } }
}

export type ChatProvider = 'anthropic' | 'openai-compat'
export type ChatMode = 'web' | 'api'
export type WebProvider = 'claude' | 'chatgpt' | 'gemini'
export type DesktopMode = 'auto' | 'workerw' | 'bottom'
export type ActiveDesktopMode = 'workerw' | 'bottom'

export interface Settings {
  enabled: Record<WidgetId, boolean>
  locked: boolean
  clockSeconds: boolean
  /** false = 24-uurs (14:05), true = 12-uurs (2:05 PM) */
  clockHour12: boolean
  city: string
  chat: { mode: ChatMode; webProvider: WebProvider; provider: ChatProvider; model: string; baseUrl: string }
  /** Public identifier of the user's own Spotify app (PKCE: no secret needed). */
  spotifyClientId: string
  desktopMode: DesktopMode
}

/** What the renderer may see. Secrets never leave main; only whether they exist. */
export interface AppState {
  settings: Settings
  /** Which secrets exist (never their values). */
  has: Record<SecretName, boolean>
  desktopMode: ActiveDesktopMode
  autostart: boolean
  version: string
}

/** chatApiKey = Anthropic key, compatApiKey = key for the OpenAI-compatible endpoint (kept apart so one never goes to the other's host). */
export type SecretName = 'chatApiKey' | 'compatApiKey' | 'icsUrl' | 'spotifyRefreshToken'

/** Every metric is nullable: unreadable sensors show "n/a" instead of crashing. */
export interface StatsSnapshot {
  cpu: number | null // 0-100
  ram: number | null // 0-100
  ramText: string | null
  gpu: number | null // 0-100
  disk: number | null // 0-100
  diskText: string | null
  netDown: number | null // bytes/s
  netUp: number | null
  cpuTemp: number | null // °C
}

export interface WeatherDay { date: string; code: number; min: number; max: number; rain: number | null }
export interface WeatherData {
  city: string
  updatedAt: number
  current: { temp: number; feelsLike: number; code: number; wind: number }
  days: WeatherDay[]
}
export interface WeatherResult { data: WeatherData | null; error?: string; stale?: boolean }

export interface Task { id: string; text: string; done: boolean; createdAt: number }
export interface CalEvent { id: string; title: string; start: string; end: string; allDay: boolean; location?: string }
export interface EventsResult { events: CalEvent[]; configured: boolean; error?: string; stale?: boolean; fetchedAt?: number }

export interface NowPlaying {
  title: string
  artist: string
  album: string
  /** Cover as a data: URI (fetched in main so the renderer needs no network). */
  artDataUrl: string | null
  /** Average colour of the cover, used as subtle accent. */
  accent: [number, number, number] | null
  isPlaying: boolean
  progressMs: number
  durationMs: number
  deviceName: string | null
  /** Date.now() when progressMs was read: lets the renderer interpolate the progress bar. */
  fetchedAt: number
}
export interface MusicState {
  status: 'no-client-id' | 'disconnected' | 'reauth' | 'no-device' | 'idle' | 'playing' | 'error'
  track?: NowPlaying
  message?: string
  /** Transient hint under the controls (Premium required, rate limited, ...). */
  notice?: string
}
export type MusicAction = 'play' | 'pause' | 'next' | 'previous'

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
