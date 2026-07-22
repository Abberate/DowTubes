import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'

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

/** Scan a download folder for leftover partial files (interrupted downloads). */
export function scanOrphanParts(dir: string): { title: string; file: string; size: number }[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.part'))
      .map((f) => ({ title: cleanPartTitle(f), file: f, size: safeSize(join(dir, f)) }))
  } catch {
    return []
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
