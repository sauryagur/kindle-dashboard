import { Menu, Tray } from 'electron'
import { text } from './i18n'
import { appAssetPath } from './paths'

export interface TrayHandlers {
  onOpenKindle: () => void
  onOpenSettings: () => void
  onQuit: () => void
}

let tray: Tray | null = null
let trayHandlers: TrayHandlers | null = null

function buildTrayMenu(handlers: TrayHandlers): Menu {
  return Menu.buildFromTemplate([
    { label: text('trayOpenKindle'), click: handlers.onOpenKindle },
    { label: text('trayOpenSettings'), click: handlers.onOpenSettings },
    { type: 'separator' },
    { label: text('trayQuit'), click: handlers.onQuit },
  ])
}

export function createTray(handlers: TrayHandlers): void {
  trayHandlers = handlers
  if (tray) {
    tray.setContextMenu(buildTrayMenu(handlers))
    return
  }

  tray = new Tray(appAssetPath('icon.png'))
  tray.setToolTip('Kindle Dashboard')
  tray.setContextMenu(buildTrayMenu(handlers))
  tray.on('click', handlers.onOpenKindle)
}

// Reconstrói o menu (ex.: após troca de idioma) usando os handlers já registrados.
export function refreshTray(): void {
  if (tray && trayHandlers) tray.setContextMenu(buildTrayMenu(trayHandlers))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
