import { app } from 'electron'
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs'
import { join, dirname } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

const isWin = process.platform === 'win32'

/** Read-only bundled resources: project root in dev, process.resourcesPath when packaged. */
function resourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
}

/** Writable per-user bin dir where the mutable, self-updating yt-dlp zipapp lives. */
export function userBinDir(): string {
  const dir = join(app.getPath('userData'), 'bin')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Bundled standalone Python interpreter (per-platform, read-only in resources).
 * We run yt-dlp as a pure-python zipapp under this Python — the PyInstaller
 * `yt-dlp_macos` binary re-extracts ~38MB and is scanned by Gatekeeper on EVERY
 * run (~30s); the zipapp starts in <1s.
 */
export function pythonPath(): string {
  const base = join(resourcesDir(), 'python')
  return isWin ? join(base, 'python.exe') : join(base, 'bin', 'python3')
}

/**
 * yt-dlp zipapp (cross-platform pure python). Seeded read-only, copied to
 * userData/bin on first run so it can self-update there without invalidating
 * the signed app bundle.
 */
export function ensureYtDlp(): string {
  const seed = join(resourcesDir(), 'engine', 'yt-dlp')
  const userCopy = join(userBinDir(), 'yt-dlp')
  if (!existsSync(userCopy) && existsSync(seed)) {
    copyFileSync(seed, userCopy)
    if (!isWin) chmodSync(userCopy, 0o755)
  }
  return userCopy
}

/** Build the command + argv to run yt-dlp: [python, zipapp, ...extra]. */
export function ytDlpArgs(extra: string[]): { cmd: string; args: string[] } {
  return { cmd: pythonPath(), args: [ensureYtDlp(), ...extra] }
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
  const path = [...extra, process.env.PATH ?? ''].join(isWin ? ';' : ':')
  // CRITICAL: redirect Python's .pyc cache OUT of the app bundle. Writing bytecode
  // into the (signed) bundle mutates sealed resources and invalidates the code
  // signature, so macOS would kill the app on its next launch. Caching to userData
  // keeps the bundle immutable while staying fast after the first run.
  return { ...process.env, PATH: path, PYTHONPYCACHEPREFIX: join(app.getPath('userData'), 'pycache') }
}
