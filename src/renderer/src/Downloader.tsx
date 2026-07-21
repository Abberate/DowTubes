import { useEffect, useRef, useState } from 'react'
import type { ProbeResult, ProgressEvent, DownloadRequest, DownloadResult } from '../../shared/types'

interface Preset {
  key: string
  label: string
  audioOnly: boolean
  format: string
  mergeFormat?: 'mp4' | 'mkv'
  audioFormat?: 'mp3' | 'm4a'
}

const PRESETS: Preset[] = [
  { key: 'mp4', label: 'Best MP4 1080p', audioOnly: false, format: 'bv*[height<=1080]+ba/b', mergeFormat: 'mp4' },
  { key: 'mkv', label: 'Best (MKV)', audioOnly: false, format: 'bv*+ba/b', mergeFormat: 'mkv' },
  { key: 'mp3', label: 'Audio MP3', audioOnly: true, format: 'ba/b', audioFormat: 'mp3' }
]

export default function Downloader(): JSX.Element {
  const [url, setUrl] = useState('')
  const [probing, setProbing] = useState(false)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [probeErr, setProbeErr] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [result, setResult] = useState<DownloadResult | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')

  const jobIdRef = useRef<string>('')

  useEffect(() => {
    window.api.defaultOutputDir().then(setOutputDir)
    const off = window.api.onProgress((ev) => {
      if (ev.id === jobIdRef.current) setProgress(ev)
    })
    return off
  }, [])

  async function doProbe(): Promise<void> {
    if (!url.trim()) return
    setProbe(null)
    setProbeErr('')
    setResult(null)
    setProgress(null)
    setProbing(true)
    try {
      setProbe(await window.api.probe(url.trim()))
    } catch (e) {
      setProbeErr(errMsg(e))
    } finally {
      setProbing(false)
    }
  }

  async function doDownload(preset: Preset): Promise<void> {
    if (!probe) return
    const id = crypto.randomUUID()
    jobIdRef.current = id
    setResult(null)
    setProgress(null)
    setDownloading(true)
    const req: DownloadRequest = {
      id,
      url: probe.webpageUrl,
      format: preset.format,
      audioOnly: preset.audioOnly,
      audioFormat: preset.audioFormat,
      mergeFormat: preset.mergeFormat,
      outputDir,
      expectedId: probe.id
    }
    try {
      setResult(await window.api.download(req))
    } finally {
      setDownloading(false)
    }
  }

  async function doUpdate(): Promise<void> {
    setUpdating(true)
    setUpdateMsg('')
    try {
      setUpdateMsg(await window.api.updateEngine())
    } catch (e) {
      setUpdateMsg(errMsg(e))
    } finally {
      setUpdating(false)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Téléchargement (debug)</h2>
      </div>

      <div className="url-bar">
        <input
          className="url-input"
          placeholder="Colle une URL (YouTube, Vimeo…)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doProbe()}
          spellCheck={false}
        />
        <button className="btn primary" onClick={doProbe} disabled={probing || !url.trim()}>
          {probing ? 'Analyse…' : 'Sonder'}
        </button>
      </div>

      {probeErr && <p className="err">⚠️ {probeErr}</p>}

      {probe && (
        <div className="probe">
          <div className="probe-head">
            {probe.thumbnail && <img className="thumb" src={probe.thumbnail} alt="" />}
            <div className="probe-meta">
              <div className="probe-title">{probe.title}</div>
              <div className="probe-sub">
                {probe.uploader ?? 'inconnu'} · {fmtDuration(probe.durationSeconds)}
              </div>
              <div className="badges">
                {probe.hasDrm && <span className="badge drm">DRM</span>}
                <span className="badge">{probe.formats.length} formats</span>
                {probe.subtitleLangs.length > 0 && (
                  <span className="badge">{probe.subtitleLangs.length} sous-titres</span>
                )}
                {probe.autoCaptionLangs.length > 0 && (
                  <span className="badge subtle">{probe.autoCaptionLangs.length} auto</span>
                )}
              </div>
            </div>
          </div>

          <details className="formats">
            <summary>Formats disponibles ({probe.formats.length})</summary>
            <div className="fmt-table">
              {probe.formats
                .slice()
                .reverse()
                .map((f) => (
                  <div className="fmt-row" key={f.formatId}>
                    <span className="fmt-id">{f.formatId}</span>
                    <span>{f.resolution}</span>
                    <span>{f.ext}</span>
                    <span>{f.fps ? `${f.fps}fps` : ''}</span>
                    <span className="fmt-codec">
                      {f.isAudioOnly ? '🎵 audio' : f.isVideoOnly ? '🎬 vidéo' : '🎬+🎵'}
                    </span>
                    <span className="fmt-size">{fmtBytes(f.filesize)}</span>
                  </div>
                ))}
            </div>
          </details>

          <div className="folder-row">
            <span className="folder-label">Dossier :</span>
            <span className="folder-path" title={outputDir}>{outputDir || '…'}</span>
            <button className="btn small" onClick={async () => {
              const d = await window.api.pickFolder()
              if (d) setOutputDir(d)
            }}>Choisir…</button>
          </div>

          {probe.hasDrm ? (
            <p className="err drm-banner">
              🔒 Contenu protégé par DRM — téléchargement refusé par conception.
            </p>
          ) : (
            <div className="presets">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  className="btn preset"
                  onClick={() => doDownload(p)}
                  disabled={downloading || !outputDir}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {(downloading || progress) && (
        <div className="progress-box">
          <div className="progress-head">
            <span>{phaseLabel(progress)}</span>
            <span className="progress-stats">
              {progress?.speed != null && `${fmtBytes(progress.speed)}/s`}
              {progress?.eta != null && ` · ${fmtEta(progress.eta)} restant`}
            </span>
            {downloading && (
              <button className="btn small danger" onClick={() => window.api.cancel(jobIdRef.current)}>
                Annuler
              </button>
            )}
          </div>
          <div className="bar">
            <div
              className={`bar-fill ${progress?.percent == null ? 'indeterminate' : ''}`}
              style={progress?.percent != null ? { width: `${progress.percent}%` } : undefined}
            />
          </div>
          {progress?.percent != null && <div className="progress-pct">{progress.percent.toFixed(1)}%</div>}
        </div>
      )}

      {result && (
        <div className={`result ${result.ok ? 'ok' : 'fail'}`}>
          {result.ok ? (
            <>
              <span>✅ Terminé : <code>{result.filepath}</code></span>
              {result.filepath && (
                <button className="btn small" onClick={() => window.api.reveal(result.filepath!)}>
                  Révéler dans le Finder
                </button>
              )}
            </>
          ) : result.errorKind === 'canceled' ? (
            <span>⏹ Annulé.</span>
          ) : (
            <>
              <span>❌ {result.error}</span>
              {result.errorKind === 'extractor' && (
                <button className="btn small" onClick={doUpdate} disabled={updating}>
                  {updating ? 'Mise à jour…' : 'Mettre à jour le moteur'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {updateMsg && <p className="update-msg">🛠 {updateMsg}</p>}
    </section>
  )
}

// ── Formatters ────────────────────────────────────────────────────────────────

function phaseLabel(p: ProgressEvent | null): string {
  switch (p?.phase) {
    case 'postprocessing':
      return 'Post-traitement (ffmpeg)…'
    case 'done':
      return 'Terminé'
    case 'error':
      return 'Erreur'
    case 'canceled':
      return 'Annulé'
    default:
      return 'Téléchargement…'
  }
}

function fmtBytes(n: number | null): string {
  if (n == null) return '—'
  const u = ['o', 'Ko', 'Mo', 'Go']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

function fmtEta(s: number | null): string {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function fmtDuration(s: number | null): string {
  if (s == null) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${m}:${sec.toString().padStart(2, '0')}`
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
