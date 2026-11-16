export const WIDGET_IDS = ['clock', 'stats', 'weather', 'agenda', 'chat'] as const
export type WidgetId = (typeof WIDGET_IDS)[number]

export const WIDGET_TITLES: Record<WidgetId, string> = {
  clock: 'Klok',
  stats: 'Systeem',
  weather: 'Weer',
  agenda: 'Agenda & taken',
  chat: 'AI-chat'
}

export const WIDGET_SIZES: Record<WidgetId, { width: number; height: number }> = {
  clock: { width: 300, height: 150 },
  stats: { width: 300, height: 320 },
  weather: { width: 300, height: 270 },
  agenda: { width: 340, height: 400 },
  chat: { width: 380, height: 480 }
}

export type ChatProvider = 'anthropic' | 'openai-compat'
export type DesktopMode = 'auto' | 'workerw' | 'bottom'
export type ActiveDesktopMode = 'workerw' | 'bottom'

export interface Settings {
  enabled: Record<WidgetId, boolean>
  locked: boolean
  clockSeconds: boolean
  city: string
  chat: { provider: ChatProvider; model: string; baseUrl: string }
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
export type SecretName = 'chatApiKey' | 'compatApiKey' | 'icsUrl'

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

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
