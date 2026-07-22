import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { AppSettings } from '../shared/types'

const DEFAULTS: AppSettings = {
  notify: true,
  embedMetadata: true,
  embedThumbnail: true,
  cookiesBrowser: ''
}

let cache: AppSettings | null = null

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  if (cache) return cache
  try {
    if (existsSync(settingsFile())) {
      cache = { ...DEFAULTS, ...(JSON.parse(readFileSync(settingsFile(), 'utf8')) as Partial<AppSettings>) }
    } else {
      cache = { ...DEFAULTS }
    }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  cache = { ...getSettings(), ...patch }
  try {
    const f = settingsFile()
    mkdirSync(dirname(f), { recursive: true })
    const tmp = `${f}.tmp`
    writeFileSync(tmp, JSON.stringify(cache))
    renameSync(tmp, f)
  } catch {
    /* best-effort */
  }
  return cache
}
