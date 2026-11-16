import type { BrowserWindow } from 'electron'
import { CH } from '../shared/ipc'
import type { WidgetId } from '../shared/types'
import { getSettings } from './store'
import { createStatsSampler } from './services/stats'
import { fetchWeather } from './services/weather'

const STATS_MS = 1500
const WEATHER_MS = 15 * 60_000

const alive = (w: BrowserWindow): boolean => !w.isDestroyed() && !w.webContents.isDestroyed()

/** Stats poll only while the window is actually visible; a hidden/minimised widget costs nothing. */
function runStats(win: BrowserWindow): () => void {
  const sample = createStatsSampler()
  let busy = false
  const tick = async (): Promise<void> => {
    if (busy || !alive(win) || !win.isVisible() || win.isMinimized()) return
    busy = true
    try {
      const s = await sample()
      if (alive(win)) win.webContents.send(CH.stats, s)
    } finally {
      busy = false
    }
  }
  void tick()
  const t = setInterval(tick, STATS_MS)
  return () => clearInterval(t)
}

export async function refreshWeather(win: BrowserWindow): Promise<void> {
  const r = await fetchWeather(getSettings().city, true)
  if (alive(win)) win.webContents.send(CH.weather, r)
}

function runWeather(win: BrowserWindow): () => void {
  const t = setInterval(() => void refreshWeather(win), WEATHER_MS)
  return () => clearInterval(t)
}

/** Start the background work a widget needs; returns a stop function (called when its window closes). */
export function startRunner(id: WidgetId, win: BrowserWindow): () => void {
  if (id === 'stats') return runStats(win)
  if (id === 'weather') return runWeather(win)
  return () => {}
}
