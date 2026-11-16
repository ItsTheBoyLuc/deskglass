import { BrowserWindow, WebContentsView, session, shell } from 'electron'
import type { WebProvider } from '../shared/types'
import { PROVIDERS, chromeUserAgent, isAllowedNavigation, isPermissionAllowed } from '../shared/webproviders'

/** Own persistent session: the user logs in on the site once and it is remembered (we never touch the cookies). */
const PARTITION = 'persist:ai-chat'
/** Space the renderer reserves: header above the view, a thin strip below (holds the resize handle). */
export const WEB_HEADER_PX = 44
export const WEB_FOOTER_PX = 18

const views = new Map<BrowserWindow, { view: WebContentsView; off: () => void }>()
let sessionReady = false
let activeProvider: WebProvider = 'claude'
const OPEN_COOLDOWN_MS = 3000
const GESTURE_WINDOW_MS = 2000

function prepareSession(): void {
  if (sessionReady) return
  sessionReady = true
  const ses = session.fromPartition(PARTITION)
  ses.setUserAgent(chromeUserAgent(process.versions.chrome))
  ses.setPermissionRequestHandler((_wc, permission, cb, details) => cb(isPermissionAllowed(permission, activeProvider, details.requestingUrl)))
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => isPermissionAllowed(permission, activeProvider, requestingOrigin))
}

function layout(win: BrowserWindow, view: WebContentsView): void {
  if (win.isDestroyed()) return
  const [w, h] = win.getContentSize()
  view.setBounds({ x: 0, y: WEB_HEADER_PX, width: Math.max(0, w!), height: Math.max(0, h! - WEB_HEADER_PX - WEB_FOOTER_PX) })
}

export function detachWebChat(win: BrowserWindow): void {
  const entry = views.get(win)
  if (!entry) return
  views.delete(win)
  entry.off()
  if (!win.isDestroyed()) win.contentView.removeChildView(entry.view)
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close()
}

/**
 * Embed the provider's website in the chat widget. The remote page gets no preload and no Node access, can only
 * navigate within the provider's domains, and only the clipboard permission. Other links open in the system browser.
 */
export function attachWebChat(win: BrowserWindow, provider: WebProvider): void {
  detachWebChat(win)
  prepareSession()
  activeProvider = provider
  const view = new WebContentsView({
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  })
  win.contentView.addChildView(view)
  layout(win, view)
  const onResize = (): void => layout(win, view)
  const onHide = (): void => view.setVisible(false) // a hidden widget keeps no live page on screen
  const onShow = (): void => view.setVisible(true)
  win.on('resize', onResize)
  win.on('hide', onHide)
  win.on('show', onShow)
  const onClosed = (): void => detachWebChat(win)
  win.once('closed', onClosed)
  views.set(win, { view, off: () => { win.removeListener('resize', onResize); win.removeListener('hide', onHide); win.removeListener('show', onShow); win.removeListener('closed', onClosed) } })

  const wc = view.webContents
  // Links go to the real browser only right after a real click/keypress and at most once per cooldown:
  // a script calling window.open() must not be able to spam tabs or open phishing pages.
  let lastGesture = 0
  let lastOpen = 0
  wc.on('input-event', (_e, input) => {
    if (input.type === 'mouseDown' || input.type === 'keyDown') lastGesture = Date.now()
  })
  const openInBrowser = (url: string): void => {
    const now = Date.now()
    if (now - lastGesture >= GESTURE_WINDOW_MS || now - lastOpen <= OPEN_COOLDOWN_MS) return
    try {
      const u = new URL(url)
      if (u.protocol === 'https:' && !u.username && !u.password) {
        lastOpen = now
        void shell.openExternal(u.href)
      }
    } catch { /* malformed URL: ignore */ }
  }
  wc.setWindowOpenHandler(({ url }) => { openInBrowser(url); return { action: 'deny' } })
  // A blocked navigation (e.g. "sign in with Google") goes to the real browser instead of a dead click.
  const guard = (e: Electron.Event, url: string): void => {
    if (isAllowedNavigation(provider, url)) return
    e.preventDefault()
    openInBrowser(url)
  }
  wc.on('will-navigate', (e, url) => guard(e, url))
  wc.on('will-redirect', (e, url) => guard(e, url))
  wc.on('will-attach-webview', (e) => e.preventDefault())
  // Offline at start (or a transient error): retry with a growing delay instead of a permanently blank view.
  let attempts = 0
  const load = (): void => { if (!wc.isDestroyed()) void wc.loadURL(PROVIDERS[provider].url).catch(() => {}) }
  wc.on('did-finish-load', () => { attempts = 0 })
  wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return // -3 = aborted by a newer navigation
    setTimeout(load, Math.min(5000 * 2 ** attempts++, 60_000))
  })
  load()
}

export const hasWebChat = (win: BrowserWindow): boolean => views.has(win)
