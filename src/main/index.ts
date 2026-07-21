import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { VersionInfo } from '../shared/types'
import { ensureYtDlp, ffmpegPath } from './binaries'

const execFileP = promisify(execFile)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 920,
    height: 700,
    show: false,
    title: 'DowTubes',
    backgroundColor: '#14161c',
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

/** Run a binary with a version flag and return its first output line. */
async function probeVersion(bin: string, args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileP(bin, args, { timeout: 15_000 })
    const out = (stdout || stderr).trim().split('\n')[0]
    return out || 'inconnu'
  } catch (e) {
    return `indisponible (${(e as Error).message.split('\n')[0]})`
  }
}

function registerIpc(): void {
  ipcMain.handle('app:getVersions', async (): Promise<VersionInfo> => {
    const ytdlp = ensureYtDlp()
    const ffmpeg = ffmpegPath()
    const [ytdlpVersion, ffmpegVersion] = await Promise.all([
      probeVersion(ytdlp, ['--version']),
      probeVersion(ffmpeg, ['-version'])
    ])
    return {
      app: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      ytdlp: ytdlpVersion,
      ffmpeg: ffmpegVersion.replace(/^ffmpeg version /, ''),
      ytdlpPath: ytdlp,
      ffmpegPath: ffmpeg
    }
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
