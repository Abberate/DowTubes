import type { QueueItem } from './lib'
import { fmtSpeed, fmtEta } from './lib'
import { IconVideo, IconMusic, IconCheck, IconAlert, IconExternal, IconRetry, IconTrash, IconX } from './icons'

interface Props {
  item: QueueItem
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onReveal: (path: string) => void
}

export default function DownloadCard({ item, onCancel, onRetry, onRemove, onReveal }: Props): JSX.Element {
  const active = item.status === 'downloading' || item.status === 'postprocessing'
  const pct = item.progress?.percent ?? null

  return (
    <div className={`dl-card ${item.status}`}>
      <div className="dl-thumb">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" />
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
        </div>

        <div className="dl-status">
          <StatusLine item={item} />
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
        {active && (
          <button className="icon-btn danger" title="Annuler" onClick={() => onCancel(item.id)}>
            <IconX size={16} />
          </button>
        )}
        {item.status === 'done' && item.result?.filepath && (
          <button className="icon-btn" title="Révéler dans le Finder" onClick={() => onReveal(item.result!.filepath!)}>
            <IconExternal size={16} />
          </button>
        )}
        {(item.status === 'error' || item.status === 'canceled') && (
          <button className="icon-btn" title="Relancer" onClick={() => onRetry(item.id)}>
            <IconRetry size={16} />
          </button>
        )}
        {!active && (
          <button className="icon-btn" title="Retirer" onClick={() => onRemove(item.id)}>
            <IconTrash size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

function StatusLine({ item }: { item: QueueItem }): JSX.Element {
  switch (item.status) {
    case 'queued':
      return <span className="muted">En attente…</span>
    case 'downloading': {
      const p = item.progress
      const parts = [
        p?.percent != null ? `${p.percent.toFixed(0)} %` : 'Téléchargement…',
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
    case 'error':
      return (
        <span className="fail" title={item.result?.error ?? ''}>
          <IconAlert size={13} /> {item.result?.error ?? 'Erreur'}
        </span>
      )
  }
}
