import { BrowserWindow, app, screen, session } from 'electron'
import { join } from 'node:path'
import { CH } from '../shared/ipc'
import { WIDGET_IDS, WIDGET_SIZES } from '../shared/types'
import type { ActiveDesktopMode, AppState, WidgetId } from '../shared/types'
import { isAutostart } from './autostart'
import { attach } from './desktop'
import { displayForRect, rememberPosition, resolvePosition } from './positions'
import type { DisplayInfo, Point, Rect } from './positions'
import { startRunner } from './runners'
import { getSettings, secrets, store } from './store'

/** Widgets that take mouse/keyboard input even when "locked" (they can't be click-through). */
const INTERACTIVE: ReadonlySet<WidgetId> = new Set(['agenda', 'chat'])
const MARGIN = 24
const GAP = 16

const widgets = new Map<WidgetId, BrowserWindow>()
const stops = new Map<WidgetId, () => void>()
let settingsWin: BrowserWindow | null = null
let activeMode: ActiveDesktopMode = 'bottom'
let onModeChange: (() => void) | null = null
/** Lets the tray refresh its label once the desktop mode is known (avoids a circular import). */
export const setModeListener = (cb: () => void): void => { onModeChange = cb }

const displays = (): DisplayInfo[] => screen.getAllDisplays().map((d) => ({ id: d.id, workArea: d.workArea }))

/** First-run layout on the primary display: two columns on the right, chat on the left. */
function defaultPosition(id: WidgetId, wa: Rect): Point {
  const right = (w: number): number => wa.x + wa.width - w - MARGIN
  const col2 = right(WIDGET_SIZES.clock.width)
  const col1 = col2 - GAP - WIDGET_SIZES.agenda.width // widest widget of the column
  const top = wa.y + MARGIN
  switch (id) {
    case 'clock': return { x: col2, y: top }
    case 'stats': return { x: col2, y: top + WIDGET_SIZES.clock.height + GAP }
    case 'weather': return { x: col1, y: top }
    case 'agenda': return { x: col1, y: top + WIDGET_SIZES.weather.height + GAP }
    case 'chat': return { x: wa.x + MARGIN, y: top }
  }
}

function placement(id: WidgetId): Point {
  return resolvePosition(store.get('positions')[id], WIDGET_SIZES[id], displays(), screen.getPrimaryDisplay().id, (wa) => defaultPosition(id, wa))
}

export function buildState(): AppState {
  return {
    settings: getSettings(),
    has: { chatApiKey: secrets.has('chatApiKey'), compatApiKey: secrets.has('compatApiKey'), icsUrl: secrets.has('icsUrl') },
    desktopMode: activeMode,
    autostart: isAutostart(),
    version: app.getVersion()
  }
}

export function broadcastState(): void {
  const state = buildState()
  for (const w of [...widgets.values(), settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send(CH.state, state)
  }
}

const rendererUrl = (id: string): { url?: string; file?: string } =>
  process.env.ELECTRON_RENDERER_URL
    ? { url: `${process.env.ELECTRON_RENDERER_URL}/index.html?w=${id}` }
    : { file: join(import.meta.dirname, '../renderer/index.html') }

function load(win: BrowserWindow, id: string): void {
  const t = rendererUrl(id)
  if (t.url) void win.loadURL(t.url)
  else void win.loadFile(t.file as string, { query: { w: id } })
}

/** Renderer pages are local and static: never allow navigation, new windows or permission prompts. */
function harden(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.on('will-redirect', (e) => e.preventDefault())
  win.webContents.on('will-attach-webview', (e) => e.preventDefault())
}

const baseWebPrefs = (): Electron.WebPreferences => ({
  preload: join(import.meta.dirname, '../preload/index.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
  webSecurity: true
})

export function initSession(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
}

function createWidget(id: WidgetId): BrowserWindow {
  const size = WIDGET_SIZES[id]
  const pos = placement(id)
  const win = new BrowserWindow({
    ...size,
    ...pos,
    show: false,
    frame: false,
    resizable: false,
    minimizable: true, // must stay true so Win+D is a normal minimise we can undo
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    backgroundMaterial: 'acrylic',
    backgroundColor: '#00000000',
    webPreferences: baseWebPrefs()
  })
  harden(win)
  load(win, id)
  win.once('ready-to-show', () => {
    activeMode = attach(win, getSettings().desktopMode).mode
    onModeChange?.()
    win.showInactive()
    applyLock(id)
    broadcastState()
  })
  stops.set(id, startRunner(id, win))
  win.on('closed', () => {
    stops.get(id)?.()
    stops.delete(id)
    widgets.delete(id)
  })
  widgets.set(id, win)
  return win
}

export function applyLock(id?: WidgetId): void {
  const locked = getSettings().locked
  for (const [wid, w] of widgets) {
    if (id && wid !== id) continue
    if (!w.isDestroyed()) w.setIgnoreMouseEvents(locked && !INTERACTIVE.has(wid))
  }
}

/** Create/destroy windows so they match settings.enabled. Destroying frees the renderer process. */
export function syncWidgets(): void {
  const enabled = getSettings().enabled
  for (const id of WIDGET_IDS) {
    const win = widgets.get(id)
    if (enabled[id] && !win) createWidget(id)
    else if (!enabled[id] && win) win.close()
  }
  applyLock()
  broadcastState()
}

export function repositionAll(): void {
  for (const [id, w] of widgets) {
    if (w.isDestroyed()) continue
    const p = placement(id)
    w.setBounds({ ...p, ...WIDGET_SIZES[id] }) // setBounds, not setPosition: avoids DPI-induced resizes
  }
}

// --- dragging: main follows the cursor, so it works for any desktop mode and mixed-DPI setups ---
let dragTimer: NodeJS.Timeout | null = null

export function startDrag(win: BrowserWindow): void {
  if (getSettings().locked || dragTimer) return
  const id = [...widgets].find(([, w]) => w === win)?.[0]
  if (!id) return
  const origin = win.getPosition()
  const cursor0 = screen.getCursorScreenPoint()
  const size = WIDGET_SIZES[id]
  win.once('closed', () => endDrag(win)) // a vanished window must not leave the timer running
  dragTimer = setInterval(() => {
    if (win.isDestroyed()) return endDrag(win)
    const c = screen.getCursorScreenPoint()
    win.setBounds({ x: origin[0]! + c.x - cursor0.x, y: origin[1]! + c.y - cursor0.y, ...size })
  }, 16)
}

export function endDrag(win: BrowserWindow): void {
  if (dragTimer) clearInterval(dragTimer)
  dragTimer = null
  const id = [...widgets].find(([, w]) => w === win)?.[0]
  if (!id || win.isDestroyed()) return
  const b = win.getBounds()
  const d = displayForRect(b, displays())
  if (!d) return
  const all = store.get('positions')
  store.set('positions', { ...all, [id]: rememberPosition(all[id], d.id, { x: b.x, y: b.y }) })
}

// --- settings window (a normal window, not a desktop widget) ---
export function openSettings(): void {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show()
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 540,
    height: 640,
    title: 'DeskGlass – Instellingen',
    autoHideMenuBar: true,
    backgroundColor: '#1b1b1f',
    webPreferences: baseWebPrefs()
  })
  harden(settingsWin)
  load(settingsWin, 'settings')
  settingsWin.on('closed', () => { settingsWin = null })
}

export const widgetFor = (win: BrowserWindow | null): WidgetId | undefined =>
  win ? [...widgets].find(([, w]) => w === win)?.[0] : undefined
export const isOurWindow = (win: BrowserWindow | null): boolean => Boolean(win) && (widgetFor(win) !== undefined || win === settingsWin)
export const isSettingsWindow = (win: BrowserWindow | null): boolean => Boolean(win) && win === settingsWin

export function watchDisplays(): void {
  let t: NodeJS.Timeout | null = null
  const later = (): void => {
    if (t) clearTimeout(t)
    t = setTimeout(repositionAll, 500)
  }
  screen.on('display-added', later)
  screen.on('display-removed', later)
  screen.on('display-metrics-changed', later)
}
