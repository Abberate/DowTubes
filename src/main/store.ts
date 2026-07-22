import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { FolderScan } from '../shared/types'

// Persist the download list as JSON in userData. A native SQLite module would
// need an Electron-ABI rebuild (electron-rebuild) — overkill for a download list.
function queueFile(): string {
  return join(app.getPath('userData'), 'queue.json')
}

export function loadQueue(): unknown[] {
  const f = queueFile()
  // Try the main file, then the backup if it's missing/corrupt.
  for (const p of [f, `${f}.bak`]) {
    try {
      if (!existsSync(p)) continue
      const data = JSON.parse(readFileSync(p, 'utf8'))
      if (Array.isArray(data)) return data
    } catch {
      /* try the next candidate */
    }
  }
  return []
}

export function saveQueue(items: unknown[]): void {
  try {
    const f = queueFile()
    mkdirSync(dirname(f), { recursive: true })
    // Keep the previous good copy as a backup, then write atomically.
    if (existsSync(f)) {
      try {
        renameSync(f, `${f}.bak`)
      } catch {
        /* ignore */
      }
    }
    const tmp = `${f}.tmp`
    writeFileSync(tmp, JSON.stringify(items))
    renameSync(tmp, f)
  } catch {
    /* best-effort */
  }
}

// ── Per-download recovery records ─────────────────────────────────────────────
// One small file per in-progress download, so incomplete downloads survive even a
// total loss/corruption of queue.json and can be auto-resumed on next launch.
function recoveryDir(): string {
  const d = join(app.getPath('userData'), 'recovery')
  mkdirSync(d, { recursive: true })
  return d
}

export function saveRecord(item: { id: string }): void {
  try {
    writeFileSync(join(recoveryDir(), `${item.id}.json`), JSON.stringify(item))
  } catch {
    /* best-effort */
  }
}

export function removeRecord(id: string): void {
  try {
    unlinkSync(join(recoveryDir(), `${id}.json`))
  } catch {
    /* already gone */
  }
}

export function listRecords(): unknown[] {
  try {
    return readdirSync(recoveryDir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(recoveryDir(), f), 'utf8')))
  } catch {
    return []
  }
}

const MEDIA_RE = /\.(mp4|mkv|webm|m4a|mp3|opus|aac|flac|mov|avi|wav)$/i
const AUDIO_RE = /\.(m4a|mp3|opus|aac|flac|wav)$/i

/** Scan a download folder: completed media files + leftover partial downloads. */
export function scanFolder(dir: string): FolderScan {
  const done: FolderScan['done'] = []
  const partial: FolderScan['partial'] = []
  try {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f)
      if (f.endsWith('.part')) {
        const m = f.match(/\.f?(\d+)\.[a-z0-9]+\.part$/i)
        partial.push({ title: cleanPartTitle(f), file: f, size: safeSize(full), formatCode: m ? m[1] : '' })
      } else if (MEDIA_RE.test(f)) {
        const ext = (f.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
        done.push({ title: f.replace(/\.[a-z0-9]+$/i, ''), path: full, ext, size: safeSize(full), audio: AUDIO_RE.test(f) })
      }
    }
  } catch {
    /* dir missing */
  }
  return { done, partial }
}

// Keys the user has removed from the reconstructed list, so they don't reappear.
function dismissedFile(): string {
  return join(app.getPath('userData'), 'dismissed.json')
}
export function listDismissed(): string[] {
  try {
    const d = JSON.parse(readFileSync(dismissedFile(), 'utf8'))
    return Array.isArray(d) ? d : []
  } catch {
    return []
  }
}
export function addDismissed(key: string): void {
  try {
    const set = new Set(listDismissed())
    set.add(key)
    writeFileSync(dismissedFile(), JSON.stringify([...set]))
  } catch {
    /* best-effort */
  }
}

function safeSize(p: string): number {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}

/** "Titre.f400.mp4.part" -> "Titre". */
function cleanPartTitle(name: string): string {
  const t = name
    .replace(/\.part$/i, '')
    .replace(/\.f?\d+\.[a-z0-9]+$/i, '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/\.f?\d+$/i, '')
  return t || name.replace(/\.part$/i, '')
}
