import { Menu, Tray, app, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'
import { SIZE_PRESETS, WIDGET_IDS, WIDGET_TITLES } from '../shared/types'
import { isAutostart, setAutostart } from './autostart'
import { applyLock, applyPreset, broadcastState, buildState, openSettings, syncWidgets } from './windows'
import { getSettings, updateSettings } from './store'

let tray: Tray | null = null

function menu(): Menu {
  const s = getSettings()
  return Menu.buildFromTemplate([
    { label: `DeskGlass (${buildState().desktopMode === 'workerw' ? 'bureaublad-laag' : 'onderaan'})`, enabled: false },
    { type: 'separator' },
    ...WIDGET_IDS.map((id) => ({
      label: WIDGET_TITLES[id].replace(/&/g, '&&'), // a single "&" would be eaten as an accelerator marker
      type: 'checkbox' as const,
      checked: s.enabled[id],
      click: (): void => { updateSettings({ enabled: { [id]: !getSettings().enabled[id] } }); syncWidgets(); refreshTray() }
    })),
    {
      label: 'Formaat',
      submenu: WIDGET_IDS.map((id) => ({
        label: WIDGET_TITLES[id].replace(/&/g, '&&'),
        submenu: SIZE_PRESETS.map((p) => ({ label: p, click: (): void => applyPreset(id, p) }))
      }))
    },
    { type: 'separator' },
    {
      label: 'Widgets vergrendelen',
      type: 'checkbox',
      checked: s.locked,
      click: (): void => { updateSettings({ locked: !getSettings().locked }); applyLock(); broadcastState(); refreshTray() }
    },
    { label: 'Instellingen…', click: openSettings },
    {
      label: 'Starten met Windows',
      type: 'checkbox',
      checked: isAutostart(),
      enabled: app.isPackaged,
      click: (item): void => { setAutostart(item.checked); broadcastState(); refreshTray() }
    },
    { type: 'separator' },
    { label: 'Afsluiten', click: (): void => app.quit() }
  ])
}

export function refreshTray(): void {
  tray?.setContextMenu(menu())
}

export function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('DeskGlass')
  tray.on('click', openSettings)
  refreshTray()
}
