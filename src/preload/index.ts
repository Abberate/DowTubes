import { contextBridge, ipcRenderer } from 'electron'
import type { VersionInfo } from '../shared/types'

// The ONLY surface the sandboxed renderer can reach. No raw ipcRenderer, fs, or
// child_process is ever exposed — every privileged call is an allowlisted method here.
const api = {
  getVersions: (): Promise<VersionInfo> => ipcRenderer.invoke('app:getVersions')
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
