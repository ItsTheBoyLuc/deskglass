import type {
  AppState, ChatEvent, ChatMessage, EventsResult, SecretName, StatsSnapshot, Task, WeatherResult
} from './types'

/** IPC channel names, shared by main and preload so they cannot drift apart. */
export const CH = {
  getState: 'state:get',
  state: 'state:update',
  setSettings: 'settings:set',
  setSecret: 'secret:set',
  setAutostart: 'autostart:set',
  openSettings: 'app:open-settings',
  dragStart: 'drag:start',
  dragEnd: 'drag:end',
  stats: 'stats:update',
  weatherGet: 'weather:get',
  weather: 'weather:update',
  tasksList: 'tasks:list',
  tasksAdd: 'tasks:add',
  tasksToggle: 'tasks:toggle',
  tasksRemove: 'tasks:remove',
  eventsGet: 'agenda:events',
  chatHistory: 'chat:history',
  chatSend: 'chat:send',
  chatCancel: 'chat:cancel',
  chatNew: 'chat:new',
  chatEvent: 'chat:event'
} as const

export type Unsubscribe = () => void
export type SecretResult = { ok: true } | { ok: false; error: string }

/** The only surface the renderer gets (window.deskglass). No Node, no keys, no network. */
export interface DeskglassApi {
  getState(): Promise<AppState>
  onState(cb: (s: AppState) => void): Unsubscribe
  setSettings(patch: unknown): Promise<AppState>
  setSecret(name: SecretName, value: string): Promise<SecretResult>
  setAutostart(on: boolean): Promise<boolean>
  openSettings(): void
  dragStart(): void
  dragEnd(): void
  onStats(cb: (s: StatsSnapshot) => void): Unsubscribe
  getWeather(): Promise<WeatherResult>
  onWeather(cb: (w: WeatherResult) => void): Unsubscribe
  listTasks(): Promise<Task[]>
  addTask(text: string): Promise<Task[]>
  toggleTask(id: string): Promise<Task[]>
  removeTask(id: string): Promise<Task[]>
  getEvents(force?: boolean): Promise<EventsResult>
  chatHistory(): Promise<ChatMessage[]>
  chatSend(text: string): Promise<void>
  chatCancel(): void
  chatNew(): Promise<void>
  onChat(cb: (e: ChatEvent) => void): Unsubscribe
}
