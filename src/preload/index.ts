import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '../shared/ipc'
import type { DeskglassApi, Unsubscribe } from '../shared/ipc'

function on<T>(channel: string, cb: (v: T) => void): Unsubscribe {
  const listener = (_e: Electron.IpcRendererEvent, v: T): void => cb(v)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: DeskglassApi = {
  getState: () => ipcRenderer.invoke(CH.getState),
  onState: (cb) => on(CH.state, cb),
  setSettings: (patch) => ipcRenderer.invoke(CH.setSettings, patch),
  setSecret: (name, value) => ipcRenderer.invoke(CH.setSecret, name, value),
  setAutostart: (on) => ipcRenderer.invoke(CH.setAutostart, on),
  openSettings: () => ipcRenderer.send(CH.openSettings),
  dragStart: () => ipcRenderer.send(CH.dragStart),
  dragEnd: () => ipcRenderer.send(CH.dragEnd),
  resizeStart: () => ipcRenderer.send(CH.resizeStart),
  resizeEnd: () => ipcRenderer.send(CH.resizeEnd),
  setPreset: (id, preset) => ipcRenderer.invoke(CH.setPreset, id, preset),
  onStats: (cb) => on(CH.stats, cb),
  getWeather: () => ipcRenderer.invoke(CH.weatherGet),
  onWeather: (cb) => on(CH.weather, cb),
  listTasks: () => ipcRenderer.invoke(CH.tasksList),
  addTask: (text) => ipcRenderer.invoke(CH.tasksAdd, text),
  toggleTask: (id) => ipcRenderer.invoke(CH.tasksToggle, id),
  removeTask: (id) => ipcRenderer.invoke(CH.tasksRemove, id),
  getEvents: (force) => ipcRenderer.invoke(CH.eventsGet, Boolean(force)),
  chatHistory: () => ipcRenderer.invoke(CH.chatHistory),
  chatSend: (text) => ipcRenderer.invoke(CH.chatSend, text),
  chatCancel: () => ipcRenderer.send(CH.chatCancel),
  chatNew: () => ipcRenderer.invoke(CH.chatNew),
  onChat: (cb) => on(CH.chatEvent, cb),
  getMusic: () => ipcRenderer.invoke(CH.musicGet),
  onMusic: (cb) => on(CH.music, cb),
  musicControl: (action) => ipcRenderer.invoke(CH.musicControl, action),
  spotifyConnect: () => ipcRenderer.invoke(CH.spotifyConnect),
  spotifyDisconnect: () => ipcRenderer.invoke(CH.spotifyDisconnect)
}

contextBridge.exposeInMainWorld('deskglass', api)
