import { Menu, Tray, app, nativeImage } from 'electron'
import icon from '../../resources/icon.png?asset'
import { SIZE_PRESETS, WIDGET_IDS, WIDGET_TITLES } from '../shared/types'
import { isAutostart, setAutostart } from './autostart'
import { applyPreset, broadcastState, buildState, openSettings, saveAllBounds, syncWidgets } from './windows'
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
      enabled: !s.locked,
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
      click: (): void => { updateSettings({ locked: !getSettings().locked }); if (getSettings().locked) saveAllBounds(); broadcastState(); refreshTray() }
    },
    {
      label: 'Klok in 12-uurs notatie (AM/PM)',
      type: 'checkbox',
      checked: s.clockHour12,
      click: (): void => { updateSettings({ clockHour12: !getSettings().clockHour12 }); broadcastState(); refreshTray() }
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
