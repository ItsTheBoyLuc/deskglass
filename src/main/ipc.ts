import { BrowserWindow, ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { CH } from '../shared/ipc'
import type { SecretResult } from '../shared/ipc'
import type { SecretName } from '../shared/types'
import { applyLock, applyPreset, syncChatView, broadcastState, buildState, endGesture, isOurWindow, isSettingsWindow, openSettings, startDrag, startResize, syncWidgets } from './windows'
import { SIZE_PRESETS, WIDGET_IDS } from '../shared/types'
import type { SizePreset, WidgetId } from '../shared/types'
import { getSettings, secrets, updateSettings } from './store'
import { addTask, listTasks, removeTask, toggleTask } from './services/tasks'
import { clearEventsCache, getEvents } from './services/agenda'
import { cancelChat, getHistory, newChat, sendChat } from './services/chat'
import { fetchWeather } from './services/weather'
import { connectSpotify, disconnectSpotify, getMusicState, musicControl } from './services/spotify'
import type { MusicAction } from '../shared/types'
import { normalizeIcsUrl } from './services/ics'
import { isAutostart, setAutostart } from './autostart'
import { refreshTray } from './tray'

type Ev = IpcMainEvent | IpcMainInvokeEvent

/** Only our own windows may call in. Anything else (e.g. a navigated frame) is ignored. */
function trusted(e: Ev): BrowserWindow | null {
  if (e.senderFrame && e.senderFrame !== e.sender.mainFrame) return null // no sub-frames
  const win = BrowserWindow.fromWebContents(e.sender)
  // The sender must be the window's own page, never an embedded remote view (web chat).
  return win && win.webContents === e.sender && isOurWindow(win) ? win : null
}

/** Changing settings/secrets/autostart is only allowed from the settings window, not from display widgets. */
const fromSettings = (e: Ev): boolean => isSettingsWindow(trusted(e))

const guard = <A extends unknown[], R>(fn: (...a: A) => R, fallback: Awaited<R>) =>
  (e: Ev, ...a: A): R | Awaited<R> => (trusted(e) ? fn(...a) : fallback)

// spotifyRefreshToken is deliberately not settable from the renderer: only the OAuth flow in main writes it.
const SECRET_NAMES: readonly SecretName[] = ['chatApiKey', 'compatApiKey', 'icsUrl']
const MUSIC_ACTIONS: readonly MusicAction[] = ['play', 'pause', 'next', 'previous']

async function saveSecret(name: unknown, value: unknown): Promise<SecretResult> {
  if (!SECRET_NAMES.includes(name as SecretName) || typeof value !== 'string') return { ok: false, error: 'Ongeldige invoer' }
  try {
    if (name === 'icsUrl' && value.trim()) normalizeIcsUrl(value)
    await secrets.set(name as SecretName, value.trim())
    if (name === 'icsUrl') clearEventsCache()
    broadcastState()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Opslaan mislukt' }
  }
}

export function registerIpc(): void {
  ipcMain.handle(CH.getState, guard(() => buildState(), buildState()))
  ipcMain.handle(CH.setSettings, (e, patch: unknown) => {
    if (!fromSettings(e)) return buildState()
    const before = getSettings()
    const next = updateSettings(patch)
    if (JSON.stringify(before.enabled) !== JSON.stringify(next.enabled)) syncWidgets()
    if (before.locked !== next.locked) applyLock()
    if (before.chat.mode !== next.chat.mode || before.chat.webProvider !== next.chat.webProvider) syncChatView()
    refreshTray()
    broadcastState()
    return buildState()
  })
  ipcMain.handle(CH.setSecret, (e, name, value) => (fromSettings(e) ? saveSecret(name, value) : { ok: false, error: 'Geen toegang' }))
  ipcMain.handle(CH.setAutostart, (e, on: unknown) => {
    if (!fromSettings(e)) return isAutostart()
    setAutostart(on === true)
    refreshTray()
    broadcastState()
    return isAutostart()
  })
  ipcMain.on(CH.openSettings, guard(() => openSettings(), undefined))
  ipcMain.on(CH.dragStart, (e) => { const w = trusted(e); if (w) startDrag(w) })
  ipcMain.on(CH.dragEnd, (e) => { const w = trusted(e); if (w) endGesture(w) })
  ipcMain.on(CH.resizeStart, (e) => { const w = trusted(e); if (w) startResize(w) })
  ipcMain.on(CH.resizeEnd, (e) => { const w = trusted(e); if (w) endGesture(w) })
  ipcMain.handle(CH.setPreset, (e, id: unknown, preset: unknown) => {
    if (!fromSettings(e) || !WIDGET_IDS.includes(id as WidgetId) || !SIZE_PRESETS.includes(preset as SizePreset)) return
    applyPreset(id as WidgetId, preset as SizePreset)
  })

  ipcMain.handle(CH.weatherGet, guard(() => fetchWeather(getSettings().city), { data: null }))
  ipcMain.handle(CH.tasksList, guard(() => listTasks(), []))
  ipcMain.handle(CH.tasksAdd, guard((t: unknown) => addTask(t), []))
  ipcMain.handle(CH.tasksToggle, guard((id: unknown) => toggleTask(id), []))
  ipcMain.handle(CH.tasksRemove, guard((id: unknown) => removeTask(id), []))
  ipcMain.handle(CH.eventsGet, guard((force: unknown) => getEvents(force === true), { events: [], configured: false }))

  ipcMain.handle(CH.musicGet, guard(() => getMusicState(), { status: 'disconnected' } as const))
  ipcMain.handle(CH.musicControl, (e, action: unknown) => {
    if (!trusted(e) || !MUSIC_ACTIONS.includes(action as MusicAction)) return getMusicState()
    return musicControl(action as MusicAction)
  })
  ipcMain.handle(CH.spotifyConnect, async (e) => {
    if (!fromSettings(e)) return { ok: false as const, error: 'Geen toegang' }
    const r = await connectSpotify()
    broadcastState()
    return r
  })
  ipcMain.handle(CH.spotifyDisconnect, async (e) => {
    if (!fromSettings(e)) return
    await disconnectSpotify()
    broadcastState()
  })

  ipcMain.handle(CH.chatHistory, guard(() => getHistory(), []))
  ipcMain.handle(CH.chatNew, guard(() => newChat(), undefined))
  ipcMain.on(CH.chatCancel, guard(() => cancelChat(), undefined))
  ipcMain.handle(CH.chatSend, async (e, text: unknown) => {
    const win = trusted(e)
    if (!win) return
    await sendChat(text, {
      settings: getSettings(),
      apiKey: await secrets.get(getSettings().chat.provider === 'anthropic' ? 'chatApiKey' : 'compatApiKey'),
      emit: (ev) => { if (!win.isDestroyed()) win.webContents.send(CH.chatEvent, ev) }
    })
  })
}
