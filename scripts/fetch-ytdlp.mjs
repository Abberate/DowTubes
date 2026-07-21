// Downloads the correct yt-dlp binary for the current platform into resources/bin/.
// Runs on `npm install` (postinstall). Idempotent: skips if already present.
// Uses only Node built-ins so it works before dependencies exist.
import { createWriteStream, existsSync, mkdirSync, chmodSync, statSync } from 'node:fs'
import { get } from 'node:https'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const binDir = join(__dirname, '..', 'resources', 'bin')

// yt-dlp ships a distinct standalone binary per platform.
const ASSET = {
  darwin: { name: 'yt-dlp_macos', out: 'yt-dlp' },
  win32: { name: 'yt-dlp.exe', out: 'yt-dlp.exe' },
  linux: { name: 'yt-dlp', out: 'yt-dlp' }
}[process.platform]

if (!ASSET) {
  console.warn(`[fetch-ytdlp] Unsupported platform "${process.platform}" — skipping.`)
  process.exit(0)
}

const dest = join(binDir, ASSET.out)
const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ASSET.name}`

if (existsSync(dest) && statSync(dest).size > 1_000_000) {
  console.log(`[fetch-ytdlp] Already present: ${dest}`)
  process.exit(0)
}

mkdirSync(binDir, { recursive: true })

function download(u, file, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'))
    get(u, { headers: { 'User-Agent': 'dowtubes-fetch' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(download(res.headers.location, file, redirects + 1))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${u}`))
      }
      const ws = createWriteStream(file)
      res.pipe(ws)
      ws.on('finish', () => ws.close(() => resolve()))
      ws.on('error', reject)
    }).on('error', reject)
  })
}

console.log(`[fetch-ytdlp] Downloading ${ASSET.name} …`)
try {
  await download(url, dest)
  if (process.platform !== 'win32') chmodSync(dest, 0o755)
  console.log(`[fetch-ytdlp] Done → ${dest} (${(statSync(dest).size / 1e6).toFixed(1)} MB)`)
} catch (e) {
  // Never fail the whole install; the app can fetch on first run instead.
  console.error(`[fetch-ytdlp] Failed (non-fatal): ${e.message}`)
  process.exit(0)
}
