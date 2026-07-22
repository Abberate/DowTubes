import { contextBridge, ipcRenderer } from 'electron'
import type {
  VersionInfo,
  ProbeResult,
  DownloadRequest,
  DownloadResult,
  ProgressEvent,
  PlaylistInfo,
  AppSettings,
  OrphanPart
} from '../shared/types'

// The ONLY surface the sandboxed renderer can reach. No raw ipcRenderer, fs, or
// child_process is ever exposed — every privileged call is an allowlisted method here.
const api = {
  getVersions: (): Promise<VersionInfo> => ipcRenderer.invoke('app:getVersions'),
  defaultOutputDir: (): Promise<string> => ipcRenderer.invoke('app:defaultOutputDir'),
  probe: (url: string): Promise<ProbeResult> => ipcRenderer.invoke('engine:probe', url),
  probePlaylist: (url: string): Promise<PlaylistInfo | null> => ipcRenderer.invoke('engine:probePlaylist', url),
  cancelProbe: (): Promise<void> => ipcRenderer.invoke('engine:cancelProbe'),
  download: (req: DownloadRequest): Promise<DownloadResult> => ipcRenderer.invoke('engine:download', req),
  cancel: (id: string): Promise<boolean> => ipcRenderer.invoke('engine:cancel', id),
  pause: (id: string): Promise<boolean> => ipcRenderer.invoke('engine:pause', id),
  updateEngine: (): Promise<string> => ipcRenderer.invoke('engine:update'),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),
  reveal: (path: string): Promise<void> => ipcRenderer.invoke('shell:reveal', path),
  openPath: (path: string): Promise<string> => ipcRenderer.invoke('shell:openPath', path),
  loadQueue: (): Promise<unknown[]> => ipcRenderer.invoke('queue:load'),
  saveQueue: (items: unknown[]): Promise<void> => ipcRenderer.invoke('queue:save', items),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', patch),
  recSave: (item: unknown): Promise<void> => ipcRenderer.invoke('recovery:save', item),
  recRemove: (id: string): Promise<void> => ipcRenderer.invoke('recovery:remove', id),
  recList: (): Promise<unknown[]> => ipcRenderer.invoke('recovery:list'),
  recOrphans: (dir: string): Promise<OrphanPart[]> => ipcRenderer.invoke('recovery:orphans', dir),
  onOpenSettings: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('menu:openSettings', listener)
    return () => ipcRenderer.removeListener('menu:openSettings', listener)
  },
  /** Subscribe to progress events; returns an unsubscribe function. */
  onProgress: (cb: (ev: ProgressEvent) => void): (() => void) => {
    const listener = (_e: unknown, ev: ProgressEvent): void => cb(ev)
    ipcRenderer.on('engine:progress', listener)
    return () => ipcRenderer.removeListener('engine:progress', listener)
  }
}

export type DowTubesApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // Should never happen: we always run with contextIsolation enabled.
  // @ts-ignore — fallback for a non-isolated context
  window.api = api
}
