import { app, Menu, BrowserWindow, shell, type MenuItemConstructorOptions } from 'electron'

function openSettings(): void {
  BrowserWindow.getFocusedWindow()?.webContents.send('menu:openSettings')
}

export function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const appMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about', label: 'À propos de DowTubes' },
            { type: 'separator' },
            { label: 'Réglages…', accelerator: 'CmdOrCtrl+,', click: openSettings },
            { type: 'separator' },
            { role: 'hide', label: 'Masquer DowTubes' },
            { role: 'hideOthers', label: 'Masquer les autres' },
            { role: 'unhide', label: 'Tout afficher' },
            { type: 'separator' },
            { role: 'quit', label: 'Quitter DowTubes' }
          ]
        }
      ]
    : []

  const fileMenu: MenuItemConstructorOptions = {
    label: 'Fichier',
    submenu: [
      ...(!isMac
        ? [{ label: 'Réglages…', accelerator: 'CmdOrCtrl+,', click: openSettings } as MenuItemConstructorOptions, { type: 'separator' } as MenuItemConstructorOptions]
        : []),
      isMac ? { role: 'close', label: 'Fermer' } : { role: 'quit', label: 'Quitter' }
    ]
  }

  const template: MenuItemConstructorOptions[] = [
    ...appMenu,
    fileMenu,
    { role: 'editMenu', label: 'Édition' },
    { role: 'viewMenu', label: 'Affichage' },
    { role: 'windowMenu', label: 'Fenêtre' },
    {
      role: 'help',
      label: 'Aide',
      submenu: [
        { label: 'Projet yt-dlp', click: () => shell.openExternal('https://github.com/yt-dlp/yt-dlp') },
        { label: 'ffmpeg', click: () => shell.openExternal('https://ffmpeg.org') }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
