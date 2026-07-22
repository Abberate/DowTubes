import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { VersionInfo, DownloadRequest } from '../shared/types'
import { ytDlpArgs, ffmpegPath, engineEnv } from './binaries'
import { probe, probePlaylist, cancelProbe, download, cancel, pause, updateEngine } from './engine'
import { loadQueue, saveQueue } from './store'
import { getSettings, setSettings } from './settings'
import type { AppSettings } from '../shared/types'

const execFileP = promisify(execFile)

/** Default download folder: ~/Downloads/DowTubes (created if missing). */
export function defaultOutputDir(): string {
  const dir = join(app.getPath('downloads'), 'DowTubes')
  mkdirSync(dir, { recursive: true })
  return dir
}

async function probeVersion(bin: string, args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileP(bin, args, { timeout: 15_000, env: engineEnv() })
    return (stdout || stderr).trim().split('\n')[0] || 'inconnu'
  } catch (e) {
    return `indisponible (${(e as Error).message.split('\n')[0]})`
  }
}

export function registerIpc(): void {
  ipcMain.handle('app:getVersions', async (): Promise<VersionInfo> => {
    const ytdlp = ytDlpArgs(['--version'])
    const ffmpeg = ffmpegPath()
    const [ytdlpVersion, ffmpegVersion] = await Promise.all([
      probeVersion(ytdlp.cmd, ytdlp.args),
      probeVersion(ffmpeg, ['-version'])
    ])
    return {
      app: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      ytdlp: ytdlpVersion,
      ffmpeg: ffmpegVersion.replace(/^ffmpeg version /, ''),
      ytdlpPath: ytdlp.args[0],
      ffmpegPath: ffmpeg
    }
  })

  ipcMain.handle('app:defaultOutputDir', () => defaultOutputDir())

  ipcMain.handle('engine:probe', (_e, url: string) => probe(url))

  ipcMain.handle('engine:probePlaylist', (_e, url: string) => probePlaylist(url))

  ipcMain.handle('engine:cancelProbe', () => cancelProbe())

  ipcMain.handle('engine:download', (e, req: DownloadRequest) =>
    download(req, (ev) => {
      if (!e.sender.isDestroyed()) e.sender.send('engine:progress', ev)
    })
  )

  ipcMain.handle('engine:cancel', (_e, id: string) => cancel(id))

  ipcMain.handle('engine:pause', (_e, id: string) => pause(id))

  ipcMain.handle('engine:update', () => updateEngine())

  ipcMain.handle('dialog:pickFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('shell:reveal', (_e, p: string) => shell.showItemInFolder(p))

  ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))

  ipcMain.handle('queue:load', () => loadQueue())
  ipcMain.handle('queue:save', (_e, items: unknown[]) => saveQueue(items))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => setSettings(patch))
}
