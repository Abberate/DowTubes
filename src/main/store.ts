import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'

// Persist the download list as JSON in userData. A native SQLite module would
// need an Electron-ABI rebuild (electron-rebuild) — overkill for a download list.
function queueFile(): string {
  return join(app.getPath('userData'), 'queue.json')
}

export function loadQueue(): unknown[] {
  try {
    const f = queueFile()
    if (!existsSync(f)) return []
    const data = JSON.parse(readFileSync(f, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export function saveQueue(items: unknown[]): void {
  try {
    const f = queueFile()
    mkdirSync(dirname(f), { recursive: true })
    // Atomic write: a crash mid-write must not corrupt/wipe the saved list.
    const tmp = `${f}.tmp`
    writeFileSync(tmp, JSON.stringify(items))
    renameSync(tmp, f)
  } catch {
    /* best-effort */
  }
}
