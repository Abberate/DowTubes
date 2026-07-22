import { app, BrowserWindow, shell, nativeImage } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { killAll } from './engine'
import { buildMenu } from './menu'

function iconPath(): string {
  return join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'resources', 'icon.png')
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 920,
    height: 820,
    minWidth: 480,
    minHeight: 560,
    show: false,
    title: 'DowTubes',
    icon: iconPath(),
    backgroundColor: '#0f0f12',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security posture: untrusted renderer, all privilege stays in main.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // External links open in the OS browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setName('DowTubes')

app.whenReady().then(() => {
  app.setAboutPanelOptions({
    applicationName: 'DowTubes',
    applicationVersion: app.getVersion(),
    credits: 'Développé par B.A Abdoulaye',
    copyright: '© 2026 B.A Abdoulaye'
  })
  // Dev: show our icon in the Dock instead of the default Electron one.
  if (process.platform === 'darwin' && !app.isPackaged) {
    const icon = nativeImage.createFromPath(iconPath())
    if (!icon.isEmpty()) app.dock?.setIcon(icon)
  }
  registerIpc()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Don't leave yt-dlp/ffmpeg children running after the app quits.
app.on('before-quit', killAll)
