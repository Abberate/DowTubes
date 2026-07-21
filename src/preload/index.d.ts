import type { DowTubesApi } from './index'

declare global {
  interface Window {
    api: DowTubesApi
  }
}

export {}
