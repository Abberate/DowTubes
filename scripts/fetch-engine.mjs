// Fetches the download engine into resources/ on `npm install` (postinstall):
//   1. yt-dlp zipapp (pure-python, cross-platform)     -> resources/engine/yt-dlp
//   2. standalone Python for this platform             -> resources/python/
// The zipapp under a bundled Python starts in <1s; the PyInstaller yt-dlp binary
// re-extracts ~38MB and is Gatekeeper-scanned on every run (~30s). Idempotent.
import { createWriteStream, existsSync, mkdirSync, chmodSync, statSync, rmSync } from 'node:fs'
import { get } from 'node:https'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const engineDir = join(root, 'resources', 'engine')
const resourcesDir = join(root, 'resources')

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'))
    get(url, { headers: { 'User-Agent': 'dowtubes-fetch' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(download(res.headers.location, dest, redirects + 1))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const ws = createWriteStream(dest)
      res.pipe(ws)
      ws.on('finish', () => ws.close(() => resolve()))
      ws.on('error', reject)
    }).on('error', reject)
  })
}

function getJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'))
    get(url, { headers: { 'User-Agent': 'dowtubes-fetch', Accept: 'application/vnd.github+json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(getJson(res.headers.location, redirects + 1))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

async function fetchYtDlp() {
  mkdirSync(engineDir, { recursive: true })
  const dest = join(engineDir, 'yt-dlp')
  if (existsSync(dest) && statSync(dest).size > 1_000_000) {
    console.log('[engine] yt-dlp zipapp present')
    return
  }
  console.log('[engine] downloading yt-dlp zipapp…')
  await download('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', dest)
  if (process.platform !== 'win32') chmodSync(dest, 0o755)
  console.log(`[engine] yt-dlp zipapp ${(statSync(dest).size / 1e6).toFixed(1)} MB`)
}

const TRIPLE = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc'
}

async function fetchPython() {
  const pythonBin = join(resourcesDir, 'python', process.platform === 'win32' ? 'python.exe' : join('bin', 'python3'))
  if (existsSync(pythonBin)) {
    console.log('[engine] standalone Python present')
    return
  }
  const triple = TRIPLE[`${process.platform}-${process.arch}`]
  if (!triple) {
    console.warn(`[engine] no standalone Python for ${process.platform}-${process.arch}, skipping`)
    return
  }
  console.log('[engine] resolving standalone Python…')
  const rel = await getJson('https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest')
  const suffix = `-${triple}-install_only.tar.gz`
  const asset =
    rel.assets.find((a) => a.name.endsWith(suffix) && a.name.includes('cpython-3.12')) ||
    rel.assets.find((a) => a.name.endsWith(suffix))
  if (!asset) {
    console.warn('[engine] no Python asset found, skipping')
    return
  }
  const tmp = join(tmpdir(), asset.name)
  console.log(`[engine] downloading ${asset.name}…`)
  await download(asset.browser_download_url, tmp)
  console.log('[engine] extracting Python…')
  rmSync(join(resourcesDir, 'python'), { recursive: true, force: true })
  // install_only tarball extracts to a top-level "python/" directory.
  execFileSync('tar', ['xzf', tmp, '-C', resourcesDir], { stdio: 'ignore' })
  rmSync(tmp, { force: true })
  console.log('[engine] standalone Python ready')
}

try {
  await fetchYtDlp()
  await fetchPython()
} catch (e) {
  // Never fail the whole install; the app can fetch/update on first run.
  console.error(`[engine] fetch failed (non-fatal): ${e.message}`)
  process.exit(0)
}
