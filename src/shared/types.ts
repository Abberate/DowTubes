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

/** A single downloadable stream reported by yt-dlp for a URL. */
export interface FormatInfo {
  formatId: string
  ext: string
  resolution: string
  height: number | null
  fps: number | null
  vcodec: string
  acodec: string
  tbr: number | null
  filesize: number | null
  isVideoOnly: boolean
  isAudioOnly: boolean
  note: string
}

/** Result of probing a URL with `yt-dlp -J`. */
export interface ProbeResult {
  id: string
  title: string
  uploader: string | null
  durationSeconds: number | null
  thumbnail: string | null
  webpageUrl: string
  hasDrm: boolean
  formats: FormatInfo[]
  subtitleLangs: string[]
  autoCaptionLangs: string[]
}

export type DownloadPhase = 'downloading' | 'postprocessing' | 'done' | 'error' | 'canceled'

/** Streamed to the renderer as a download progresses. */
export interface ProgressEvent {
  id: string
  phase: DownloadPhase
  percent: number | null
  downloadedBytes: number | null
  totalBytes: number | null
  speed: number | null
  eta: number | null
  message?: string
}

/** A download request from the renderer. */
export interface DownloadRequest {
  id: string
  url: string
  /** yt-dlp -f selector, e.g. "bv*[height<=1080]+ba/b" or "ba". */
  format: string
  audioOnly: boolean
  audioFormat?: 'mp3' | 'm4a'
  mergeFormat?: 'mp4' | 'mkv'
  outputDir: string
  /** Video id (from probe) used to target partial-file cleanup on cancel. */
  expectedId?: string
  /** Title, used for the completion notification. */
  title?: string
  /** Optional subtitle to fetch (video downloads only). */
  subtitle?: { lang: string; auto: boolean; embed: boolean }
}

export type DownloadErrorKind = 'drm' | 'network' | 'extractor' | 'canceled' | 'unknown'

/** Final outcome of a download, resolved when the yt-dlp process exits. */
export interface DownloadResult {
  id: string
  ok: boolean
  filepath: string | null
  error: string | null
  errorKind?: DownloadErrorKind
}
