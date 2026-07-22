import { Notification, shell } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { createInterface } from 'node:readline'
import { readdirSync, unlinkSync, createWriteStream, chmodSync } from 'node:fs'
import { get as httpsGet } from 'node:https'
import { join } from 'node:path'
import type {
  ProbeResult,
  FormatInfo,
  DownloadRequest,
  DownloadResult,
  ProgressEvent,
  DownloadErrorKind,
  PlaylistInfo
} from '../shared/types'
import { ytDlpArgs, ffmpegPath, engineEnv, userBinDir } from './binaries'
import { getSettings } from './settings'

const execFileP = promisify(execFile)

/** Live downloads by job id, so they can be cancelled/paused. */
const running = new Map<string, ChildProcess>()
const canceled = new Set<string>()
const paused = new Set<string>()
let probeAbort: AbortController | null = null

// ── Probe ───────────────────────────────────────────────────────────────────

/** Resolve a URL to a typed info_dict via `yt-dlp -J`. Throws on failure. */
export async function probe(url: string): Promise<ProbeResult> {
  const { cmd, args } = ytDlpArgs(['-J', '--no-warnings', '--no-playlist', url])
  probeAbort = new AbortController()
  let stdout: string
  try {
    const res = await execFileP(cmd, args, {
      timeout: 90_000,
      maxBuffer: 64 * 1024 * 1024,
      env: engineEnv(),
      signal: probeAbort.signal
    })
    stdout = res.stdout
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr ?? (e as Error).message
    const err = new Error(humanError(stderr)) as Error & { kind: DownloadErrorKind }
    err.kind = classifyError(stderr)
    throw err
  }

  const info = JSON.parse(stdout) as Record<string, unknown>
  const rawFormats = (info.formats as Record<string, unknown>[]) ?? []

  const formats: FormatInfo[] = rawFormats
    .filter((f) => f.url || f.fragments)
    .map((f) => {
      // yt-dlp uses the string 'none' for a truly-absent stream and null/absent for
      // "unknown" (e.g. the generic extractor doesn't probe codecs). Keep them distinct.
      const vcodec = normCodec(f.vcodec)
      const acodec = normCodec(f.acodec)
      const height = (f.height as number) ?? null
      const isVideoOnly = acodec === 'none' && vcodec !== 'none' && vcodec !== null
      const isAudioOnly = vcodec === 'none' && acodec !== 'none' && acodec !== null
      return {
        formatId: String(f.format_id),
        ext: (f.ext as string) || '',
        height,
        fps: (f.fps as number) ?? null,
        vcodec: vcodec ?? 'inconnu',
        acodec: acodec ?? 'inconnu',
        tbr: (f.tbr as number) ?? null,
        filesize: (f.filesize as number) ?? (f.filesize_approx as number) ?? null,
        isVideoOnly,
        isAudioOnly,
        resolution: resolutionLabel(f, height, isAudioOnly),
        note: (f.format_note as string) || ''
      }
    })

  const hasDrm = info.has_drm === true || rawFormats.some((f) => f.has_drm === true)

  return {
    id: String(info.id ?? ''),
    title: (info.title as string) || 'Sans titre',
    uploader: (info.uploader as string) || (info.channel as string) || null,
    durationSeconds: (info.duration as number) ?? null,
    thumbnail: (info.thumbnail as string) ?? null,
    webpageUrl: (info.webpage_url as string) || url,
    hasDrm,
    formats,
    subtitleLangs: Object.keys((info.subtitles as object) ?? {}),
    autoCaptionLangs: Object.keys((info.automatic_captions as object) ?? {})
  }
}

/** Abort an in-flight probe (the renderer ignores the resulting rejection). */
export function cancelProbe(): void {
  probeAbort?.abort()
}

/** Detect a playlist/channel and return a flat list of its videos (up to 100). Null if not a playlist. */
export async function probePlaylist(url: string): Promise<PlaylistInfo | null> {
  const { cmd, args } = ytDlpArgs(['--flat-playlist', '-J', '--playlist-end', '100', '--no-warnings', url])
  let stdout: string
  try {
    const res = await execFileP(cmd, args, { timeout: 60_000, maxBuffer: 64 * 1024 * 1024, env: engineEnv() })
    stdout = res.stdout
  } catch {
    return null
  }
  let info: Record<string, unknown>
  try {
    info = JSON.parse(stdout)
  } catch {
    return null
  }
  if (info._type !== 'playlist' || !Array.isArray(info.entries)) return null
  const entries = (info.entries as Record<string, unknown>[])
    .filter((e) => e && e.id)
    .map((e) => ({
      id: String(e.id),
      title: (e.title as string) || (e.url as string) || String(e.id),
      url: (e.url as string) || `https://www.youtube.com/watch?v=${e.id}`
    }))
  if (entries.length < 2) return null
  return {
    title: (info.title as string) || 'Playlist',
    count: (info.playlist_count as number) ?? entries.length,
    entries
  }
}

// ── Download ──────────────────────────────────────────────────────────────────

/** Start a download; streams progress via onProgress; resolves when the process exits. */
export function download(
  req: DownloadRequest,
  onProgress: (ev: ProgressEvent) => void
): Promise<DownloadResult> {
  if (req.audioOnly === false && !req.format) req.format = 'bv*+ba/b'

  const { cmd, args } = ytDlpArgs(buildArgs(req))
  const child = spawn(cmd, args, { env: engineEnv() })
  running.set(req.id, child)

  let finalPath: string | null = null
  let stderr = ''

  const rl = createInterface({ input: child.stdout! })
  rl.on('line', (line) => {
    if (line.startsWith('[dl]|')) {
      onProgress(parseDownloadLine(req.id, line))
    } else if (line.startsWith('[pp]')) {
      onProgress({
        id: req.id,
        phase: 'postprocessing',
        percent: null,
        downloadedBytes: null,
        totalBytes: null,
        speed: null,
        eta: null,
        message: 'Post-traitement (ffmpeg)…'
      })
    } else if (line.startsWith('[fp]')) {
      finalPath = line.slice(4).trim()
    }
  })

  child.stderr!.on('data', (d: Buffer) => {
    stderr += d.toString()
    if (stderr.length > 16_000) stderr = stderr.slice(-16_000)
  })

  // Finalize on 'close' (all stdio drained), never on the last data chunk.
  return new Promise<DownloadResult>((resolve) => {
    child.on('error', (err) => {
      running.delete(req.id)
      resolve({ id: req.id, ok: false, filepath: null, error: err.message, errorKind: 'unknown' })
    })
    child.on('close', (code) => {
      rl.close()
      running.delete(req.id)

      if (paused.has(req.id)) {
        // Keep the .part files so a resume (re-queue) continues where it stopped.
        paused.delete(req.id)
        onProgress(emptyEvent(req.id, 'paused'))
        return resolve({ id: req.id, ok: false, filepath: null, error: 'En pause', errorKind: 'paused' })
      }
      if (canceled.has(req.id)) {
        canceled.delete(req.id)
        cleanupPartials(req.outputDir, req.expectedId)
        onProgress(emptyEvent(req.id, 'canceled'))
        return resolve({ id: req.id, ok: false, filepath: null, error: 'Annulé', errorKind: 'canceled' })
      }
      if (code === 0) {
        onProgress({ ...emptyEvent(req.id, 'done'), percent: 100 })
        notifyDone(req.title, finalPath)
        return resolve({ id: req.id, ok: true, filepath: finalPath, error: null })
      }
      const kind = classifyError(stderr)
      onProgress({ ...emptyEvent(req.id, 'error'), message: humanError(stderr) })
      resolve({ id: req.id, ok: false, filepath: finalPath, error: humanError(stderr), errorKind: kind })
    })
  })
}

/** Pause a running download: stop the process but KEEP partial files so it can resume. */
export function pause(id: string): boolean {
  const child = running.get(id)
  if (!child) return false
  paused.add(id)
  child.kill('SIGTERM')
  return true
}

/** Cancel a running download: terminate the process; partials are cleaned on close. */
export function cancel(id: string): boolean {
  const child = running.get(id)
  if (!child) return false
  canceled.add(id)
  child.kill('SIGTERM')
  // Hard kill if it ignores SIGTERM.
  setTimeout(() => {
    if (running.has(id)) running.get(id)!.kill('SIGKILL')
  }, 4000)
  return true
}

/** Terminate all in-flight downloads (called on app quit so children aren't orphaned). */
export function killAll(): void {
  for (const child of running.values()) {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
}

function notifyDone(title: string | undefined, filepath: string | null): void {
  try {
    if (!getSettings().notify || !Notification.isSupported()) return
    const n = new Notification({ title: 'Téléchargement terminé', body: title ?? 'Fichier prêt' })
    if (filepath) n.on('click', () => shell.showItemInFolder(filepath))
    n.show()
  } catch {
    /* notifications are best-effort */
  }
}

/** Self-update: re-download the yt-dlp zipapp into userData/bin (never the signed bundle). */
export async function updateEngine(): Promise<string> {
  const dest = join(userBinDir(), 'yt-dlp')
  await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', dest)
  if (process.platform !== 'win32') chmodSync(dest, 0o755)
  const { cmd, args } = ytDlpArgs(['--version'])
  const { stdout } = await execFileP(cmd, args, { timeout: 30_000, env: engineEnv() })
  return `yt-dlp mis à jour (${stdout.trim()}).`
}

/** Minimal HTTPS download with redirect following. */
function downloadFile(url: string, dest: string, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'))
    httpsGet(url, { headers: { 'User-Agent': 'dowtubes' } }, (res) => {
      const code = res.statusCode ?? 0
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume()
        return resolve(downloadFile(res.headers.location, dest, redirects + 1))
      }
      if (code !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${code}`))
      }
      const ws = createWriteStream(dest)
      res.pipe(ws)
      ws.on('finish', () => ws.close(() => resolve()))
      ws.on('error', reject)
    }).on('error', reject)
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildArgs(req: DownloadRequest): string[] {
  const args = ['--newline', '--no-warnings', '--ignore-config', '--no-playlist']

  if (req.audioOnly) {
    args.push('-f', req.format || 'ba/b', '-x', '--audio-format', req.audioFormat || 'mp3', '--audio-quality', '0')
  } else {
    args.push('-f', req.format)
    if (req.mergeFormat) args.push('--merge-output-format', req.mergeFormat)
  }

  if (req.subtitle && !req.audioOnly) {
    const s = req.subtitle
    args.push(s.auto ? '--write-auto-subs' : '--write-subs', '--sub-langs', s.lang, '--convert-subs', 'srt')
    if (s.embed) args.push('--embed-subs')
  }

  // Metadata is safe (ffmpeg). Cover art only for MP3 (ffmpeg handles it; m4a/mp4
  // would need AtomicParsley/mutagen we don't bundle yet).
  const s = getSettings()
  if (s.embedMetadata) args.push('--embed-metadata')
  // Cover art for all audio: mp3 via ffmpeg, m4a via mutagen (bundled in the Python).
  if (s.embedThumbnail && req.audioOnly) args.push('--embed-thumbnail')

  args.push(
    '--ffmpeg-location', ffmpegPath(),
    '-o', join(req.outputDir, '%(title)s.%(ext)s'),
    // %(progress)j (whole-dict JSON) emits nothing in current yt-dlp — use explicit fields.
    '--progress-template',
    'download:[dl]|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress.fragment_index)s|%(progress.fragment_count)s',
    '--progress-template', 'postprocess:[pp]|%(progress.status)s',
    // NB: --print implies --quiet, which SUPPRESSES --progress-template. Use --exec
    // (a post-hook, no quiet side-effect) to emit the final path after the move.
    '--exec', 'after_move:echo [fp]{}',
    req.url
  )
  return args
}

/** Parse a "[dl]|status|downloaded|total|total_est|speed|eta|frag_idx|frag_cnt" line. */
function parseDownloadLine(id: string, line: string): ProgressEvent {
  const f = line.split('|')
  const status = f[1]
  const downloaded = num(f[2])
  const total = num(f[3]) ?? num(f[4])
  const fragIdx = num(f[7])
  const fragCnt = num(f[8])
  let percent: number | null = null
  if (total && downloaded != null) percent = Math.min(100, (downloaded / total) * 100)
  else if (fragCnt && fragIdx != null) percent = Math.min(100, (fragIdx / fragCnt) * 100)
  if (status === 'finished') percent = 100
  return {
    id,
    phase: 'downloading',
    percent,
    downloadedBytes: downloaded,
    totalBytes: total,
    speed: num(f[5]),
    eta: num(f[6]),
    message: status
  }
}

/** yt-dlp prints "NA" for unknown numeric fields. */
function num(s: string | undefined): number | null {
  if (s == null || s === 'NA' || s === 'None' || s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** 'none' = stream truly absent; null = unknown (not probed); otherwise the codec name. */
function normCodec(v: unknown): string | null {
  if (v === 'none') return 'none'
  if (v == null) return null
  return String(v)
}

function resolutionLabel(f: Record<string, unknown>, height: number | null, isAudioOnly: boolean): string {
  const res = f.resolution as string | undefined
  if (res) return res
  if (isAudioOnly) return 'audio only'
  if (height) return `${(f.width as number) ?? '?'}x${height}`
  return String(f.ext ?? '').toUpperCase() || '—'
}

function emptyEvent(id: string, phase: ProgressEvent['phase']): ProgressEvent {
  return { id, phase, percent: null, downloadedBytes: null, totalBytes: null, speed: null, eta: null }
}

/** Best-effort removal of leftover .part/.ytdl fragments after a cancel. */
function cleanupPartials(dir: string, id?: string): void {
  try {
    for (const name of readdirSync(dir)) {
      const isPartial = name.endsWith('.part') || name.endsWith('.ytdl') || name.includes('.part-')
      if (isPartial && (!id || name.includes(id))) {
        try {
          unlinkSync(join(dir, name))
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* dir may not exist yet */
  }
}

function classifyError(stderr: string): DownloadErrorKind {
  const s = stderr.toLowerCase()
  if (/drm|has_drm|drm protected/.test(s)) return 'drm'
  if (/http error|urlopen error|network|timed out|timeout|connection|temporary failure|getaddrinfo/.test(s))
    return 'network'
  if (/unable to extract|unsupported url|not a valid url|signature|nsig|player|extractor|unable to download webpage/.test(s))
    return 'extractor'
  return 'unknown'
}

function humanError(stderr: string): string {
  const line = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('ERROR:') || /error/i.test(l))
    .pop()
  return (line || stderr.split('\n').filter(Boolean).pop() || 'Erreur inconnue').replace(/^ERROR:\s*/i, '').slice(0, 300)
}
