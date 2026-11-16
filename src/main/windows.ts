import { BrowserWindow, app, screen, session } from 'electron'
import { join } from 'node:path'
import { CH } from '../shared/ipc'
import { WIDGET_IDS, WIDGET_LIMITS, WIDGET_PRESETS, WIDGET_SIZES } from '../shared/types'
import type { ActiveDesktopMode, AppState, SizePreset, WidgetId } from '../shared/types'
import { isAutostart } from './autostart'
import { anyMouseButtonDown, attach } from './desktop'
import { clampSize, clampToWorkArea, displayForRect, gestureBounds, rememberBounds, resolveBounds } from './positions'
import type { DisplayInfo, Point, Rect } from './positions'
import { startRunner } from './runners'
import { attachWebChat, detachWebChat } from './webchat'
import { getSettings, secrets, store } from './store'

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
    case 'music': return { x: wa.x + MARGIN, y: top + WIDGET_SIZES.chat.height + GAP }
  }
}

/** Saved (or default) position + size of a widget, clamped to limits and the monitor it lives on. */
function bounds(id: WidgetId): Rect {
  return resolveBounds(store.get('positions')[id], WIDGET_SIZES[id], WIDGET_LIMITS[id], displays(), screen.getPrimaryDisplay().id, (wa) => defaultPosition(id, wa))
}

export function buildState(): AppState {
  return {
    settings: getSettings(),
    has: { chatApiKey: secrets.has('chatApiKey'), compatApiKey: secrets.has('compatApiKey'), icsUrl: secrets.has('icsUrl'), spotifyRefreshToken: secrets.has('spotifyRefreshToken') },
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
  !app.isPackaged && process.env.ELECTRON_RENDERER_URL
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
  const win = new BrowserWindow({
    ...bounds(id),
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
    if (id === 'chat') syncChatView()
    onModeChange?.()
    win.showInactive()
    broadcastState()
  })
  stops.set(id, startRunner(id, win))
  win.on('closed', () => {
    stops.get(id)?.()
    stops.delete(id)
    widgets.delete(id)
    if (id === 'chat') chatShown = ''
  })
  widgets.set(id, win)
  return win
}

/** Chat widget: embedded provider website (web mode) or the native chat UI (api mode). */
let chatShown = ''
export function syncChatView(): void {
  const win = widgets.get('chat')
  if (!win || win.isDestroyed()) { chatShown = ''; return }
  const { mode, webProvider } = getSettings().chat
  const want = mode === 'web' ? `web:${webProvider}` : 'api'
  if (want === chatShown) return
  chatShown = want
  if (mode === 'web') attachWebChat(win, webProvider)
  else detachWebChat(win)
}

/** Create/destroy windows so they match settings.enabled. Destroying frees the renderer process. */
export function syncWidgets(): void {
  const enabled = getSettings().enabled
  for (const id of WIDGET_IDS) {
    const win = widgets.get(id)
    if (enabled[id] && !win) createWidget(id)
    else if (!enabled[id] && win) win.close()
  }
  broadcastState()
}

export function repositionAll(): void {
  for (const [id, w] of widgets) {
    if (w.isDestroyed()) continue
    w.setBounds(bounds(id)) // setBounds, not setPosition: avoids DPI-induced resizes
  }
}

// --- move / resize: main follows the cursor, so it works for any desktop mode and mixed-DPI setups ---
// A transparent frameless window cannot be resized natively, so the renderer only signals start/end.
type Gesture = 'move' | 'resize'
const MAX_GESTURE_MS = 60_000
const BUTTON_GRACE_MS = 250
/** The one active gesture: which window, its timer, and the 'closed' hook to remove when it ends. */
let gesture: { win: BrowserWindow; timer: NodeJS.Timeout; onClosed: () => void } | null = null
const idOf = (win: BrowserWindow): WidgetId | undefined => [...widgets].find(([, w]) => w === win)?.[0]

function startGesture(win: BrowserWindow, kind: Gesture): void {
  if (getSettings().locked || gesture) return
  const id = idOf(win)
  if (!id) return
  const origin = win.getBounds()
  const cursor0 = screen.getCursorScreenPoint()
  const wa = (displayForRect(origin, displays()) ?? displays()[0])?.workArea
  // While resizing, the right/bottom edge may not leave the monitor.
  const room: Rect = wa
    ? { x: origin.x, y: origin.y, width: wa.x + wa.width - origin.x, height: wa.y + wa.height - origin.y }
    : { x: origin.x, y: origin.y, width: 10_000, height: 10_000 }
  const onClosed = (): void => endGesture(win)
  win.once('closed', onClosed)
  if (process.env.DESKGLASS_DEBUG) console.info('[gesture] start', kind, id)
  const startedAt = Date.now()
  let last = ''
  const timer = setInterval(() => {
    if (win.isDestroyed()) return endGesture(win)
    // Watchdog: a lost pointerup (renderer reload/crash, release over the embedded web view) must not leave the
    // widget glued to the cursor and block every later gesture.
    const age = Date.now() - startedAt
    if (age > MAX_GESTURE_MS || (age > BUTTON_GRACE_MS && anyMouseButtonDown() === false)) return endGesture(win)
    const c = screen.getCursorScreenPoint()
    // locked is read every tick: locking in the middle of a drag freezes the widget where it is
    const next = gestureBounds(kind, origin, { x: c.x - cursor0.x, y: c.y - cursor0.y }, WIDGET_LIMITS[id], room, getSettings().locked)
    const key = `${next.x},${next.y},${next.width},${next.height}`
    if (key === last) return // only touch the window when something changed
    last = key
    win.setBounds(next)
  }, kind === 'resize' ? 32 : 16)
  gesture = { win, timer, onClosed }
}

export const startDrag = (win: BrowserWindow): void => startGesture(win, 'move')
export const startResize = (win: BrowserWindow): void => startGesture(win, 'resize')

/** Clamp the widget into its monitor (size within limits, position inside the work area) and remember it. */
function saveBounds(id: WidgetId, win: BrowserWindow): void {
  const b = win.getBounds()
  const d = displayForRect(b, displays())
  if (!d) return
  const size = clampSize(b, WIDGET_LIMITS[id], d.workArea)
  const r: Rect = { ...clampToWorkArea(b, size, d.workArea), ...size }
  if (r.x !== b.x || r.y !== b.y || r.width !== b.width || r.height !== b.height) win.setBounds(r)
  const all = store.get('positions')
  store.set('positions', { ...all, [id]: rememberBounds(all[id], d.id, r) })
}

export function endGesture(win: BrowserWindow): void {
  if (!gesture || gesture.win !== win) return // a stray end (e.g. a plain click on a header) must not touch anything
  if (process.env.DESKGLASS_DEBUG) console.info('[gesture] end', idOf(win))
  clearInterval(gesture.timer)
  win.removeListener('closed', gesture.onClosed)
  gesture = null
  const id = idOf(win)
  if (id && !win.isDestroyed()) saveBounds(id, win)
}

/** Remember where every widget is right now (done when the widgets get locked). */
export function saveAllBounds(): void {
  for (const [id, w] of widgets) if (!w.isDestroyed()) saveBounds(id, w)
}

/** S / M / L size preset for one widget (tray and settings). Resizing is off while locked. */
export function applyPreset(id: WidgetId, preset: SizePreset): void {
  if (getSettings().locked) return
  const win = widgets.get(id)
  const target = WIDGET_PRESETS[id]?.[preset]
  if (!win || win.isDestroyed() || !target) return
  win.setBounds({ ...win.getBounds(), ...target })
  saveBounds(id, win)
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
export const widgetWindow = (id: WidgetId): BrowserWindow | undefined => widgets.get(id)
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
