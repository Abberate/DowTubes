// Types shared across the process boundary (main <-> preload <-> renderer).

/** Versions of the app and its bundled engines, surfaced to prove the chain works. */
export interface VersionInfo {
  app: string
  electron: string
  node: string
  chrome: string
  ytdlp: string
  ffmpeg: string
  ytdlpPath: string
  ffmpegPath: string
}
