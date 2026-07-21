import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { createInterface } from 'node:readline'
import { readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ProbeResult,
  FormatInfo,
  DownloadRequest,
  DownloadResult,
  ProgressEvent,
  DownloadErrorKind
} from '../shared/types'
import { ensureYtDlp, ffmpegPath, engineEnv } from './binaries'

const execFileP = promisify(execFile)

/** Live downloads by job id, so they can be cancelled. */
const running = new Map<string, ChildProcess>()
const canceled = new Set<string>()

// ── Probe ───────────────────────────────────────────────────────────────────

/** Resolve a URL to a typed info_dict via `yt-dlp -J`. Throws on failure. */
export async function probe(url: string): Promise<ProbeResult> {
  const ytdlp = ensureYtDlp()
  let stdout: string
  try {
    const res = await execFileP(ytdlp, ['-J', '--no-warnings', '--no-playlist', url], {
      timeout: 90_000,
      maxBuffer: 64 * 1024 * 1024,
      env: engineEnv()
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
      const vcodec = (f.vcodec as string) || 'none'
      const acodec = (f.acodec as string) || 'none'
      const height = (f.height as number) ?? null
      return {
        formatId: String(f.format_id),
        ext: (f.ext as string) || '',
        height,
        fps: (f.fps as number) ?? null,
        vcodec,
        acodec,
        tbr: (f.tbr as number) ?? null,
        filesize: (f.filesize as number) ?? (f.filesize_approx as number) ?? null,
        isVideoOnly: acodec === 'none' && vcodec !== 'none',
        isAudioOnly: vcodec === 'none' && acodec !== 'none',
        resolution:
          (f.resolution as string) ||
          (height ? `${(f.width as number) ?? '?'}x${height}` : vcodec === 'none' ? 'audio only' : '?'),
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

// ── Download ──────────────────────────────────────────────────────────────────

/** Start a download; streams progress via onProgress; resolves when the process exits. */
export function download(
  req: DownloadRequest,
  onProgress: (ev: ProgressEvent) => void
): Promise<DownloadResult> {
  if (req.audioOnly === false && !req.format) req.format = 'bv*+ba/b'

  const args = buildArgs(req)
  const child = spawn(ensureYtDlp(), args, { env: engineEnv() })
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

      if (canceled.has(req.id)) {
        canceled.delete(req.id)
        cleanupPartials(req.outputDir, req.expectedId)
        onProgress(emptyEvent(req.id, 'canceled'))
        return resolve({ id: req.id, ok: false, filepath: null, error: 'Annulé', errorKind: 'canceled' })
      }
      if (code === 0) {
        onProgress({ ...emptyEvent(req.id, 'done'), percent: 100 })
        return resolve({ id: req.id, ok: true, filepath: finalPath, error: null })
      }
      const kind = classifyError(stderr)
      onProgress({ ...emptyEvent(req.id, 'error'), message: humanError(stderr) })
      resolve({ id: req.id, ok: false, filepath: finalPath, error: humanError(stderr), errorKind: kind })
    })
  })
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

/** Self-update the yt-dlp binary in userData/bin (never touches the signed bundle). */
export async function updateEngine(): Promise<string> {
  const ytdlp = ensureYtDlp()
  const { stdout, stderr } = await execFileP(ytdlp, ['-U'], { timeout: 120_000, env: engineEnv() })
  return (stdout || stderr).trim() || 'yt-dlp est à jour.'
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

  args.push(
    '--ffmpeg-location', ffmpegPath(),
    '-o', join(req.outputDir, '%(title)s [%(id)s].%(ext)s'),
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
