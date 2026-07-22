import type { ProbeResult, ProgressEvent, DownloadResult, FormatInfo } from '../../shared/types'

export type ItemStatus = 'queued' | 'downloading' | 'postprocessing' | 'done' | 'error' | 'canceled' | 'paused'

/** One row in the download list. */
export interface QueueItem {
  id: string
  url: string
  title: string
  thumbnail: string | null
  qualityLabel: string
  format: string
  audioOnly: boolean
  audioFormat?: 'mp3' | 'm4a'
  mergeFormat?: 'mp4' | 'mkv'
  expectedId?: string
  subtitle?: SubtitleChoice
  status: ItemStatus
  progress: ProgressEvent | null
  result: DownloadResult | null
}

export interface SubtitleChoice {
  lang: string
  auto: boolean
  embed: boolean
}

/** Quick variants offered from a downloaded item's "…" menu (no re-probe needed). */
export const VARIANTS: QualityOption[] = [
  { key: 'mp3', label: 'Audio MP3', sub: '', kind: 'audio', format: 'ba/b', audioOnly: true, audioFormat: 'mp3' },
  { key: 'm4a', label: 'Audio M4A', sub: '', kind: 'audio', format: 'ba/b', audioOnly: true, audioFormat: 'm4a' },
  { key: 'v1080', label: 'Vidéo 1080p', sub: '', kind: 'video', format: 'bv*[height<=1080]+ba/b', audioOnly: false, mergeFormat: 'mp4' },
  { key: 'vbest', label: 'Meilleure vidéo', sub: '', kind: 'video', format: 'bv*+ba/b', audioOnly: false, mergeFormat: 'mp4' }
]

export interface SubLang {
  code: string
  auto: boolean
}

/** A selectable quality in the probe panel. */
export interface QualityOption {
  key: string
  label: string
  sub: string
  kind: 'video' | 'audio'
  format: string
  audioOnly: boolean
  audioFormat?: 'mp3' | 'm4a'
  mergeFormat?: 'mp4' | 'mkv'
  /** Estimated file size in bytes, when the probe provides it. */
  size?: number
}

/** Derive well-classified quality choices from a probe (8K…480p when available + audio), with size estimates. */
export function qualityOptions(probe: ProbeResult): QualityOption[] {
  const fmts = probe.formats
  const maxH = fmts.reduce((m, f) => Math.max(m, f.height ?? 0), 0)
  const bestAudio = fmts.filter((f) => f.isAudioOnly).reduce((m, f) => Math.max(m, f.filesize ?? 0), 0) || undefined
  const tiers = [
    { label: '8K', sub: '4320p', h: 4320 },
    { label: '4K', sub: '2160p', h: 2160 },
    { label: '1440p', sub: 'QHD', h: 1440 },
    { label: '1080p', sub: 'Full HD', h: 1080 },
    { label: '720p', sub: 'HD', h: 720 },
    { label: '480p', sub: 'SD', h: 480 }
  ]
  const opts: QualityOption[] = []
  if (maxH > 0) {
    for (const t of tiers) {
      if (maxH >= t.h - 60) {
        opts.push({
          key: `v${t.h}`,
          label: t.label,
          sub: `${t.sub} · MP4`,
          kind: 'video',
          format: `bv*[height<=${t.h}]+ba/b`,
          audioOnly: false,
          mergeFormat: 'mp4',
          size: videoSizeAt(fmts, t.h, bestAudio)
        })
      }
    }
  } else {
    opts.push({
      key: 'vbest',
      label: 'Meilleure',
      sub: 'Vidéo · MP4',
      kind: 'video',
      format: 'bv*+ba/b',
      audioOnly: false,
      mergeFormat: 'mp4'
    })
  }
  opts.push({ key: 'mp3', label: 'MP3', sub: '320 kbps', kind: 'audio', format: 'ba/b', audioOnly: true, audioFormat: 'mp3', size: bestAudio })
  opts.push({ key: 'm4a', label: 'M4A', sub: 'AAC', kind: 'audio', format: 'ba/b', audioOnly: true, audioFormat: 'm4a', size: bestAudio })
  return opts
}

/** Estimate the size for a video tier: best format at/under the height (+ best audio if video-only). */
function videoSizeAt(fmts: FormatInfo[], h: number, bestAudio?: number): number | undefined {
  const cands = fmts.filter((f) => f.height != null && f.height <= h)
  if (!cands.length) return undefined
  const best = cands.reduce((a, b) => ((b.height ?? 0) > (a.height ?? 0) ? b : a))
  if (best.filesize == null) return undefined
  return best.isVideoOnly && bestAudio ? best.filesize + bestAudio : best.filesize
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—'
  const u = ['o', 'Ko', 'Mo', 'Go']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

export function fmtSpeed(n: number | null | undefined): string {
  return n == null ? '' : `${fmtBytes(n)}/s`
}

export function fmtEta(s: number | null | undefined): string {
  if (s == null) return ''
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function fmtDuration(s: number | null | undefined): string {
  if (s == null) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${m}:${sec.toString().padStart(2, '0')}`
}

export function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

const LANG_NAMES: Record<string, string> = {
  fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', it: 'Italien',
  pt: 'Portugais', ar: 'Arabe', zh: 'Chinois', ja: 'Japonais', ru: 'Russe',
  nl: 'Néerlandais', ko: 'Coréen', hi: 'Hindi', tr: 'Turc', pl: 'Polonais'
}
const COMMON = ['fr', 'en', 'es', 'de', 'it', 'pt', 'ar']

export function langLabel(code: string): string {
  const base = code.split('-')[0]
  return LANG_NAMES[base] ?? code
}

/** Available subtitle languages: human subs first, common languages prioritized, auto-captions last. */
export function subtitleLangs(subs: string[], auto: string[]): SubLang[] {
  const usable = (l: string): boolean => l !== 'live_chat'
  const human = subs.filter(usable).map((code) => ({ code, auto: false }))
  const humanCodes = new Set(human.map((h) => h.code))
  const autoOnly = auto.filter((l) => usable(l) && !humanCodes.has(l)).map((code) => ({ code, auto: true }))
  const rank = (s: SubLang): number => {
    const i = COMMON.indexOf(s.code.split('-')[0])
    return (s.auto ? 1000 : 0) + (i === -1 ? 500 : i)
  }
  return [...human, ...autoOnly].sort((a, b) => rank(a) - rank(b))
}
