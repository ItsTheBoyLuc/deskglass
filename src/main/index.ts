import { app, nativeTheme } from 'electron'
import { registerIpc } from './ipc'
import { createTray } from './tray'
import { initSession, openSettings, syncWidgets, watchDisplays } from './windows'

// One instance only: a second launch just opens the settings of the running one.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', openSettings)
  nativeTheme.themeSource = 'dark'

  // Widgets live in the tray; closing the settings window must not quit the app.
  app.on('window-all-closed', () => { /* keep running */ })

  void app.whenReady().then(() => {
    initSession()
    registerIpc()
    syncWidgets()
    createTray()
    watchDisplays()
  })
}
