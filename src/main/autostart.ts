import { app } from 'electron'

/**
 * Start with Windows. The portable build runs from a temp folder, so we register the original exe
 * (PORTABLE_EXECUTABLE_FILE set by electron-builder's portable launcher). Dev builds never register.
 */
export function setAutostart(on: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: on, path: process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath })
}

export const isAutostart = (): boolean => app.getLoginItemSettings({ path: process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath }).openAtLogin
