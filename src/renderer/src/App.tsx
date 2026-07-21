import { useEffect, useState } from 'react'
import type { VersionInfo } from '../../shared/types'
import Downloader from './Downloader'

type Status = 'loading' | 'ok' | 'error'

function engineOk(v: string): boolean {
  return !/indisponible|inconnu/i.test(v)
}

export default function App(): JSX.Element {
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string>('')

  const load = (): void => {
    setStatus('loading')
    window.api
      .getVersions()
      .then((v) => {
        setInfo(v)
        setStatus('ok')
      })
      .catch((e) => {
        setError(String(e?.message ?? e))
        setStatus('error')
      })
  }

  useEffect(load, [])

  return (
    <div className="app">
      <header className="hero">
        <div className="logo">▼</div>
        <div>
          <h1>DowTubes</h1>
          <p className="tagline">Téléchargeur vidéo &amp; audio — moteur yt-dlp + ffmpeg</p>
        </div>
      </header>

      <section className="card">
        <div className="card-head">
          <h2>État du système</h2>
          <button className="btn" onClick={load} disabled={status === 'loading'}>
            {status === 'loading' ? '…' : 'Rafraîchir'}
          </button>
        </div>

        {status === 'error' && <p className="err">Erreur IPC : {error}</p>}

        <div className="rows">
          <Row label="Application" value={info?.app} kind="app" ready={status === 'ok'} />
          <Row label="Electron" value={info?.electron} kind="app" ready={status === 'ok'} />
          <Row label="Node" value={info?.node} kind="app" ready={status === 'ok'} />
          <Row label="Chromium" value={info?.chrome} kind="app" ready={status === 'ok'} />
          <div className="divider" />
          <Row
            label="yt-dlp"
            value={info?.ytdlp}
            kind="engine"
            ready={status === 'ok'}
            ok={info ? engineOk(info.ytdlp) : undefined}
            path={info?.ytdlpPath}
          />
          <Row
            label="ffmpeg"
            value={info?.ffmpeg}
            kind="engine"
            ready={status === 'ok'}
            ok={info ? engineOk(info.ffmpeg) : undefined}
            path={info?.ffmpegPath}
          />
        </div>
      </section>

      <Downloader />

      <footer className="foot">
        Phase 1 — moteur yt-dlp : sonde, formats, téléchargement, progression, refus DRM. ✅
      </footer>
    </div>
  )
}

function Row(props: {
  label: string
  value?: string
  kind: 'app' | 'engine'
  ready: boolean
  ok?: boolean
  path?: string
}): JSX.Element {
  const { label, value, kind, ready, ok, path } = props
  const dot = kind === 'engine' ? (ready ? (ok ? 'green' : 'red') : 'gray') : 'blue'
  return (
    <div className="row">
      <span className={`dot ${dot}`} />
      <span className="label">{label}</span>
      <span className="value">{ready ? value ?? '—' : '…'}</span>
      {path && <span className="path" title={path}>{path}</span>}
    </div>
  )
}
