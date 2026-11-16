import { Menu, app, nativeTheme } from 'electron'
import { registerIpc } from './ipc'
import { createTray, refreshTray } from './tray'
import { initSession, openSettings, setModeListener, syncWidgets, watchDisplays } from './windows'

// One instance only: a second launch just opens the settings of the running one.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (app.isReady()) openSettings() })
  nativeTheme.themeSource = 'dark'

  // Widgets live in the tray; closing the settings window must not quit the app.
  app.on('window-all-closed', () => { /* keep running */ })

  void app.whenReady().then(() => {
    if (app.isPackaged) Menu.setApplicationMenu(null) // no default menu => no DevTools shortcuts in release builds
    initSession()
    setModeListener(refreshTray)
    registerIpc()
    syncWidgets()
    createTray()
    watchDisplays()
  })
}
