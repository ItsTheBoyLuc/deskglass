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
  win.once('closed', () => detachWebChat(win))
  views.set(win, { view, off: () => { win.removeListener('resize', onResize); win.removeListener('hide', onHide); win.removeListener('show', onShow) } })

  const wc = view.webContents
  // Links go to the real browser only right after a real click/keypress and at most once per cooldown:
  // a script calling window.open() must not be able to spam tabs or open phishing pages.
  let lastGesture = 0
  let lastOpen = 0
  wc.on('input-event', (_e, input) => {
    if (input.type === 'mouseDown' || input.type === 'keyDown') lastGesture = Date.now()
  })
  wc.setWindowOpenHandler(({ url }) => {
    const now = Date.now()
    if (now - lastGesture < GESTURE_WINDOW_MS && now - lastOpen > OPEN_COOLDOWN_MS) {
      try {
        const u = new URL(url)
        if (u.protocol === 'https:' && !u.username && !u.password) {
          lastOpen = now
          void shell.openExternal(u.href)
        }
      } catch { /* malformed URL: ignore */ }
    }
    return { action: 'deny' }
  })
  const guard = (e: Electron.Event, url: string): void => { if (!isAllowedNavigation(provider, url)) e.preventDefault() }
  wc.on('will-navigate', (e, url) => guard(e, url))
  wc.on('will-redirect', (e, url) => guard(e, url))
  wc.on('will-attach-webview', (e) => e.preventDefault())
  void wc.loadURL(PROVIDERS[provider].url)
}

export const hasWebChat = (win: BrowserWindow): boolean => views.has(win)
