import { useState } from 'react'
import type { QueueItem } from './lib'
import { fmtSpeed, fmtEta, fmtBytes, langLabel } from './lib'
import {
  IconVideo,
  IconMusic,
  IconCheck,
  IconAlert,
  IconFolder,
  IconPlay,
  IconPause,
  IconRetry,
  IconTrash,
  IconCaptions,
  IconRefresh
} from './icons'

interface Props {
  item: QueueItem
  onPause: (id: string) => void
  onResume: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onReveal: (path: string) => void
  onOpen: (path: string) => void
  onUpdateAndRetry: (id: string) => void
}

export default function DownloadCard({
  item,
  onPause,
  onResume,
  onRetry,
  onRemove,
  onReveal,
  onOpen,
  onUpdateAndRetry
}: Props): JSX.Element {
  const [imgFailed, setImgFailed] = useState(false)
  const active = item.status === 'downloading' || item.status === 'postprocessing'
  const pct = item.progress?.percent ?? null
  const done = item.status === 'done' && !!item.result?.filepath
  const canRetry = (item.status === 'error' && item.result?.errorKind !== 'drm') || item.status === 'canceled'
  const showThumb = item.thumbnail && !imgFailed

  return (
    <div
      className={`dl-card ${item.status}`}
      onDoubleClick={() => done && onOpen(item.result!.filepath!)}
      title={done ? 'Double-cliquer pour ouvrir' : undefined}
    >
      <div className="dl-thumb">
        {showThumb ? (
          <img src={item.thumbnail!} alt="" onError={() => setImgFailed(true)} />
        ) : item.audioOnly ? (
          <IconMusic size={22} />
        ) : (
          <IconVideo size={22} />
        )}
      </div>

      <div className="dl-body">
        <div className="dl-top">
          <span className="dl-title" title={item.title}>{item.title}</span>
          <span className={`chip ${item.audioOnly ? 'audio' : 'video'}`}>
            {item.audioOnly ? <IconMusic size={12} /> : <IconVideo size={12} />}
            {item.qualityLabel}
          </span>
          {item.subtitle && (
            <span className="chip sub" title={`Sous-titres · ${langLabel(item.subtitle.lang)}`}>
              <IconCaptions size={12} />
              {langLabel(item.subtitle.lang)}
            </span>
          )}
        </div>

        <div className="dl-status">
          <StatusLine item={item} onUpdateAndRetry={onUpdateAndRetry} />
        </div>

        {(active || pct != null) && (
          <div className="dl-bar">
            <div
              className={`dl-bar-fill ${pct == null ? 'indeterminate' : ''} ${item.status === 'postprocessing' ? 'pp' : ''}`}
              style={pct != null ? { width: `${pct}%` } : undefined}
            />
          </div>
        )}
      </div>

      <div className="dl-actions">
        {item.status === 'downloading' && (
          <button className="icon-btn" title="Pause" aria-label="Mettre en pause" onClick={() => onPause(item.id)}>
            <IconPause size={16} />
          </button>
        )}
        {item.status === 'paused' && (
          <button className="icon-btn" title="Reprendre" aria-label="Reprendre" onClick={() => onResume(item.id)}>
            <IconPlay size={16} />
          </button>
        )}
        {done && (
          <>
            <button className="icon-btn" title="Ouvrir le fichier" aria-label="Ouvrir le fichier" onClick={() => onOpen(item.result!.filepath!)}>
              <IconPlay size={16} />
            </button>
            <button className="icon-btn" title="Afficher dans le Finder" aria-label="Afficher dans le Finder" onClick={() => onReveal(item.result!.filepath!)}>
              <IconFolder size={16} />
            </button>
          </>
        )}
        {canRetry && (
          <button className="icon-btn" title="Relancer" aria-label="Relancer" onClick={() => onRetry(item.id)}>
            <IconRetry size={16} />
          </button>
        )}
        <button className="icon-btn danger" title="Retirer" aria-label="Retirer" onClick={() => onRemove(item.id)}>
          <IconTrash size={16} />
        </button>
      </div>
    </div>
  )
}

function StatusLine({ item, onUpdateAndRetry }: { item: QueueItem; onUpdateAndRetry: (id: string) => void }): JSX.Element {
  switch (item.status) {
    case 'queued':
      return <span className="muted">En attente…</span>
    case 'paused':
      return <span className="muted">En pause</span>
    case 'downloading': {
      const p = item.progress
      const parts = [
        p?.percent != null ? `${p.percent.toFixed(0)} %` : 'Téléchargement…',
        p?.totalBytes != null ? `${fmtBytes(p.downloadedBytes)} / ${fmtBytes(p.totalBytes)}` : '',
        fmtSpeed(p?.speed),
        p?.eta != null ? `${fmtEta(p.eta)} restant` : ''
      ].filter(Boolean)
      return <span className="mono">{parts.join('  ·  ')}</span>
    }
    case 'postprocessing':
      return <span className="mono">Conversion (ffmpeg)…</span>
    case 'done':
      return (
        <span className="ok">
          <IconCheck size={13} /> Terminé
        </span>
      )
    case 'canceled':
      return <span className="muted">Annulé</span>
    case 'error': {
      const kind = item.result?.errorKind
      const label =
        kind === 'network'
          ? 'Problème de connexion'
          : kind === 'extractor'
            ? 'Extraction impossible — moteur peut-être obsolète'
            : kind === 'drm'
              ? 'Contenu protégé par DRM'
              : 'Échec du téléchargement'
      return (
        <div className="err-wrap">
          <span className="fail">
            <IconAlert size={13} /> {label}
            {kind === 'extractor' && (
              <button className="link-btn update-inline" onClick={() => onUpdateAndRetry(item.id)}>
                <IconRefresh size={12} /> Mettre à jour yt-dlp
              </button>
            )}
          </span>
          {item.result?.error && (
            <details className="err-details">
              <summary>Détails</summary>
              <pre>{item.result.error}</pre>
            </details>
          )}
        </div>
      )
    }
  }
}
