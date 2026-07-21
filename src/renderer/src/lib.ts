import type { ProbeResult, ProgressEvent, DownloadResult } from '../../shared/types'

export type ItemStatus = 'queued' | 'downloading' | 'postprocessing' | 'done' | 'error' | 'canceled'

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
  status: ItemStatus
  progress: ProgressEvent | null
  result: DownloadResult | null
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
}

/** Derive well-classified quality choices from a probe (4K/1440/1080/720/480 when available + audio). */
export function qualityOptions(probe: ProbeResult): QualityOption[] {
  const maxH = probe.formats.reduce((m, f) => Math.max(m, f.height ?? 0), 0)
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
          mergeFormat: 'mp4'
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
  opts.push({ key: 'mp3', label: 'MP3', sub: '320 kbps', kind: 'audio', format: 'ba/b', audioOnly: true, audioFormat: 'mp3' })
  opts.push({ key: 'm4a', label: 'M4A', sub: 'AAC', kind: 'audio', format: 'ba/b', audioOnly: true, audioFormat: 'm4a' })
  return opts
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
