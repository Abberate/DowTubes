import { app } from 'electron'
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs'
import { join, dirname } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

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

/** Normalize a node_modules binary path so it resolves inside app.asar.unpacked when packaged. */
function normalize(p: string): string {
  return app.isPackaged ? p.replace('app.asar', 'app.asar.unpacked') : p
}

/** Absolute path to the bundled ffmpeg binary. */
export function ffmpegPath(): string {
  return normalize((ffmpegStatic as unknown as string) ?? '')
}

/** Absolute path to the bundled ffprobe binary. */
export function ffprobePath(): string {
  return normalize(ffprobeStatic.path ?? '')
}

/**
 * PATH-augmented env so yt-dlp finds BOTH ffmpeg and ffprobe (they live in separate
 * node_modules dirs). yt-dlp resolves ffprobe from --ffmpeg-location's dir then PATH.
 */
export function engineEnv(): NodeJS.ProcessEnv {
  const extra = [dirname(ffmpegPath()), dirname(ffprobePath())].filter(Boolean)
  const path = [...extra, process.env.PATH ?? ''].join(pathDelimiter())
  return { ...process.env, PATH: path }
}

function pathDelimiter(): string {
  return process.platform === 'win32' ? ';' : ':'
}
