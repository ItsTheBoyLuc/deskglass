import './styles/tokens.css'
import './styles/base.css'
import './styles/widgets.css'
import { WIDGET_IDS } from '../shared/types'
import type { AppState, WidgetId } from '../shared/types'
import type { Ctx, Mount } from './dom'
import { mountClock } from './widgets/clock'
import { mountStats } from './widgets/stats'
import { mountWeather } from './widgets/weather'
import { mountAgenda } from './widgets/agenda'
import { mountChat } from './widgets/chat'
import { mountMusic } from './widgets/music'
import { mountSettings } from './widgets/settings'

const MOUNTS: Record<WidgetId | 'settings', Mount> = {
  clock: mountClock, stats: mountStats, weather: mountWeather, agenda: mountAgenda, music: mountMusic, chat: mountChat, settings: mountSettings
}

async function boot(): Promise<void> {
  const param = new URLSearchParams(location.search).get('w') ?? ''
  const id = (WIDGET_IDS as readonly string[]).includes(param) ? (param as WidgetId) : param === 'settings' ? 'settings' : null
  const root = document.getElementById('app')
  if (!id || !root) return

  const api = window.deskglass
  let state: AppState = await api.getState()
  const listeners: Array<(s: AppState) => void> = []
  api.onState((s) => {
    state = s
    applyLock(s)
    listeners.forEach((l) => l(s))
  })

  document.body.classList.toggle('settings', id === 'settings')
  const applyLock = (s: AppState): void => {
    document.body.classList.toggle('unlocked', !s.settings.locked && id !== 'settings')
    // Embedded (child) windows get no OS acrylic, so the CSS tint must carry legibility on its own.
    document.body.classList.toggle('flat', s.desktopMode === 'workerw')
  }
  applyLock(state)

  const ctx: Ctx = { api, id, state: () => state, onState: (cb) => void listeners.push(cb) }
  MOUNTS[id](root, ctx)
  if (id !== 'settings') enableDrag(api)
}

/**
 * Drag by header (or whole widget for display-only ones) and resize by the corner handle.
 * Main follows the cursor; we just signal start/end (a transparent window cannot be resized natively).
 */
function enableDrag(api: Window['deskglass']): void {
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement
    const resizing = e.button === 0 && t.closest('[data-resize]') !== null
    if (!resizing && (e.button !== 0 || !t.closest('[data-drag]') || t.closest('button,input,textarea,select,a'))) return
    const el = (resizing ? t.closest('[data-resize]') : t.closest('[data-drag]')) as HTMLElement
    el.setPointerCapture(e.pointerId)
    if (resizing) api.resizeStart()
    else api.dragStart()
    const end = (): void => {
      if (resizing) api.resizeEnd()
      else api.dragEnd()
      el.removeEventListener('pointerup', end)
      el.removeEventListener('pointercancel', end)
      el.removeEventListener('lostpointercapture', end)
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
    el.addEventListener('lostpointercapture', end)
  })
}

void boot()
