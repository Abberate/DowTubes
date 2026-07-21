import { app } from 'electron'
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'

const isWin = process.platform === 'win32'
const ytdlpName = isWin ? 'yt-dlp.exe' : 'yt-dlp'

/** Read-only bundled resources: project root in dev, process.resourcesPath when packaged. */
function resourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
}

/** Writable per-user bin dir where the mutable, self-updating yt-dlp lives. */
export function userBinDir(): string {
  const dir = join(app.getPath('userData'), 'bin')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * yt-dlp must be runnable AND self-updatable (`yt-dlp -U` rewrites its own binary),
 * so it can never live inside the signed .app — updating it there would invalidate
 * the code signature. We seed it from read-only resources into userData/bin on first
 * run and always run that copy.
 */
export function ensureYtDlp(): string {
  const seeded = join(resourcesDir(), 'bin', ytdlpName)
  const userCopy = join(userBinDir(), ytdlpName)
  if (!existsSync(userCopy) && existsSync(seeded)) {
    copyFileSync(seeded, userCopy)
    if (!isWin) chmodSync(userCopy, 0o755)
  }
  return userCopy
}

/** Absolute path to the bundled ffmpeg. Normalizes the asar.unpacked path when packaged. */
export function ffmpegPath(): string {
  const p = (ffmpegStatic as unknown as string) ?? ''
  return app.isPackaged ? p.replace('app.asar', 'app.asar.unpacked') : p
}
