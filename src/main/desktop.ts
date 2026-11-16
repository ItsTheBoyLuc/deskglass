import type { BrowserWindow } from 'electron'
import type { ActiveDesktopMode, DesktopMode } from '../shared/types'

/**
 * Keeps widget windows on the desktop, behind every other window.
 *  - 'workerw': the window becomes a child of the desktop (Progman) window, so Win+D / other windows never touch it.
 *  - 'bottom' : normal top-level window pinned to HWND_BOTTOM (keeps real acrylic blur); re-pinned on a timer and on
 *               show/focus/minimize because Windows raises a window when it is clicked.
 * All Win32 access goes through koffi; if it cannot load we stay in 'bottom' without pinning calls.
 */

type Api = {
  FindWindowW(cls: string, title: string | null): number
  SendMessageTimeoutW(h: number, msg: number, w: number, l: number, flags: number, timeout: number, out: null): number
  SetParent(child: number, parent: number): number
  GetParent(h: number): number
  GetWindowLongPtrW(h: number, idx: number): number
  SetWindowLongPtrW(h: number, idx: number, v: number): number
  SetWindowPos(h: number, after: number, x: number, y: number, cx: number, cy: number, flags: number): boolean
  ShowWindow(h: number, cmd: number): boolean
}

const GWL_STYLE = -16
const WS_POPUP = 0x80000000
const WS_CHILD = 0x40000000
const HWND_BOTTOM = 1
const HWND_TOP = 0
const SWP_NOSIZE = 0x1
const SWP_NOMOVE = 0x2
const SWP_NOACTIVATE = 0x10
const SW_SHOWNOACTIVATE = 4
const WM_SPAWN_WORKERW = 0x052c
const PIN_FLAGS = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE
const PIN_INTERVAL_MS = 2000

let api: Api | null = null
try {
  const koffi = (await import('koffi')).default
  const user32 = koffi.load('user32.dll')
  api = {
    FindWindowW: user32.func('intptr_t __stdcall FindWindowW(str16 cls, str16 title)'),
    SendMessageTimeoutW: user32.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t h, uint32 msg, uintptr_t w, intptr_t l, uint32 flags, uint32 timeout, void *out)'),
    SetParent: user32.func('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)'),
    GetParent: user32.func('intptr_t __stdcall GetParent(intptr_t h)'),
    GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t h, int idx)'),
    SetWindowLongPtrW: user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t h, int idx, intptr_t v)'),
    SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr_t h, intptr_t after, int x, int y, int cx, int cy, uint32 flags)'),
    ShowWindow: user32.func('bool __stdcall ShowWindow(intptr_t h, int cmd)')
  } as unknown as Api
} catch (e) {
  console.error('[desktop] koffi unavailable, no native pinning:', e instanceof Error ? e.message : e)
}

const hwndOf = (win: BrowserWindow): number => Number(win.getNativeWindowHandle().readBigUInt64LE(0))

const embedded = new Map<BrowserWindow, number>() // window -> original style
const pinned = new Set<BrowserWindow>()
let timer: NodeJS.Timeout | null = null

function pinBottom(win: BrowserWindow): void {
  if (!api || win.isDestroyed() || !win.isVisible() || embedded.has(win)) return
  api.SetWindowPos(hwndOf(win), HWND_BOTTOM, 0, 0, 0, 0, PIN_FLAGS)
}

/** Try to make `win` a child of the desktop. Returns true only if the parent really changed. */
function tryEmbed(win: BrowserWindow): boolean {
  if (!api) return false
  try {
    const h = hwndOf(win)
    const progman = api.FindWindowW('Progman', null)
    if (!progman) return false
    api.SendMessageTimeoutW(progman, WM_SPAWN_WORKERW, 0xd, 1, 0, 1000, null)
    const style = api.GetWindowLongPtrW(h, GWL_STYLE)
    api.SetWindowLongPtrW(h, GWL_STYLE, ((style & ~WS_POPUP) | WS_CHILD) >>> 0)
    api.SetParent(h, progman)
    if (api.GetParent(h) !== progman) {
      api.SetWindowLongPtrW(h, GWL_STYLE, style)
      return false
    }
    api.SetWindowPos(h, HWND_TOP, 0, 0, 0, 0, PIN_FLAGS)
    api.ShowWindow(h, SW_SHOWNOACTIVATE)
    embedded.set(win, style)
    return true
  } catch (e) {
    console.error('[desktop] embed failed:', e instanceof Error ? e.message : e)
    return false
  }
}

function startTimer(): void {
  timer ??= setInterval(() => pinned.forEach(pinBottom), PIN_INTERVAL_MS)
}

export interface Attached { mode: ActiveDesktopMode }

/** Attach a widget window to the desktop layer. `want` comes from settings ('auto' tries workerw first). */
export function attach(win: BrowserWindow, want: DesktopMode): Attached {
  if (want !== 'bottom' && tryEmbed(win)) return { mode: 'workerw' }
  pinned.add(win)
  const repin = (): void => pinBottom(win)
  win.on('show', repin)
  win.on('focus', () => setTimeout(repin, 0))
  win.on('restore', repin)
  win.on('minimize', () => { win.restore(); repin() }) // Win+D minimises: undo it immediately
  win.on('closed', () => { pinned.delete(win); embedded.delete(win) })
  startTimer()
  repin()
  return { mode: 'bottom' }
}

export function detachAll(): void {
  if (timer) clearInterval(timer)
  timer = null
  pinned.clear()
}

export const isEmbedded = (win: BrowserWindow): boolean => embedded.has(win)
