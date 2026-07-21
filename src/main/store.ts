import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
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
    writeFileSync(f, JSON.stringify(items))
  } catch {
    /* best-effort */
  }
}
