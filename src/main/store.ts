import Store from 'electron-store'
import { safeStorage } from 'electron'
import { DEFAULT_SETTINGS, applySettingsPatch } from '../shared/settings'
import type { CalEvent, Settings, Task, WeatherData } from '../shared/types'
import type { WidgetPositions } from './positions'
import { createSecrets } from './secrets'

interface Schema {
  settings: Settings
  /** base64 DPAPI ciphertext only (see secrets.ts) */
  secrets: Record<string, string>
  positions: Record<string, WidgetPositions>
  tasks: Task[]
  weatherCache?: WeatherData
  eventsCache?: { events: CalEvent[]; fetchedAt: number }
  geoCache?: { city: string; lat: number; lon: number; name: string }
}

export const store = new Store<Schema>({
  name: 'deskglass',
  defaults: { settings: DEFAULT_SETTINGS, secrets: {}, positions: {}, tasks: [] }
})

// Re-sanitize on every read: the JSON file is user-editable.
export const getSettings = (): Settings => applySettingsPatch(DEFAULT_SETTINGS, store.get('settings'))

export function updateSettings(patch: unknown): Settings {
  const next = applySettingsPatch(getSettings(), patch)
  store.set('settings', next)
  return next
}

export const secrets = createSecrets(safeStorage, {
  get: (k) => store.get('secrets')[k],
  set: (k, v) => store.set('secrets', { ...store.get('secrets'), [k]: v }),
  delete: (k) => {
    const { [k]: _gone, ...rest } = store.get('secrets')
    store.set('secrets', rest)
  }
})
