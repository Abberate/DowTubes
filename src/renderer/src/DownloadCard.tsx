import { useRef, useState } from 'react'
import type { QueueItem, QualityOption } from './lib'
import { fmtSpeed, fmtEta, fmtBytes, langLabel, VARIANTS } from './lib'
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
  IconRefresh,
  IconArrowUp,
  IconMore,
  IconSearch
} from './icons'

interface Props {
  item: QueueItem
  onPause: (id: string) => void
  onResume: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onReveal: (path: string) => void
  onOpen: (path: string) => void
  onStartNow: (id: string) => void
  onUpdateAndRetry: (id: string) => void
  onResumeInterrupted: (item: QueueItem) => void
  onVariant: (item: QueueItem, opt: QualityOption) => void
  onReprobe: (url: string) => void
  dragging: boolean
  onReorderStart: (id: string) => void
  onReorderOver: (id: string) => void
  onReorderEnd: () => void
}

export default function DownloadCard({
  item,
  onPause,
  onResume,
  onRetry,
  onRemove,
  onReveal,
  onOpen,
  onStartNow,
  onUpdateAndRetry,
  onResumeInterrupted,
  onVariant,
  onReprobe,
  dragging,
  onReorderStart,
  onReorderOver,
  onReorderEnd
}: Props): JSX.Element {
  const [imgFailed, setImgFailed] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  function toggleMenu(): void {
    if (menuPos) {
      setMenuPos(null)
      return
    }
    const r = moreRef.current?.getBoundingClientRect()
    if (r) setMenuPos({ top: r.bottom + 5, right: window.innerWidth - r.right })
  }
  const active = item.status === 'downloading' || item.status === 'postprocessing'
  const pct = item.progress?.percent ?? null
  const done = item.status === 'done' && !!item.result?.filepath
  // An item reconstructed from a leftover .part file: interrupted, no URL yet.
  const interrupted = item.status === 'error' && !item.url
  const canRetry =
    (item.status === 'error' && !!item.url && item.result?.errorKind !== 'drm') || item.status === 'canceled'
  const showThumb = item.thumbnail && !imgFailed

  return (
    <div
      className={`dl-card ${item.status} ${dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/x-dowtubes', item.id)
        onReorderStart(item.id)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => onReorderOver(item.id)}
      onDragEnd={onReorderEnd}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onReorderEnd()
      }}
      onDoubleClick={() => done && onOpen(item.result!.filepath!)}
      title={done ? 'Double-cliquer pour ouvrir' : undefined}
    >
      <div className="dl-thumb">
        {showThumb ? (
          <img src={item.thumbnail!} alt="" draggable={false} onError={() => setImgFailed(true)} />
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
        {item.status === 'queued' && (
          <button className="icon-btn" title="Démarrer maintenant" aria-label="Démarrer maintenant" onClick={() => onStartNow(item.id)}>
            <IconArrowUp size={16} />
          </button>
        )}
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
            {item.url && (
              <button ref={moreRef} className="icon-btn" title="Plus d'options" aria-label="Plus d'options" onClick={toggleMenu}>
                <IconMore size={16} />
              </button>
            )}
          </>
        )}
        {interrupted && (
          <button className="btn-resume" title="Coller le lien et reprendre" onClick={() => onResumeInterrupted(item)}>
            <IconPlay size={14} /> Reprendre
          </button>
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

      {menuPos && (
        <>
          <div className="menu-backdrop" onClick={() => setMenuPos(null)} />
          <div className="item-menu" style={{ top: menuPos.top, right: menuPos.right }}>
            <div className="menu-label">Télécharger une variante</div>
            {VARIANTS.map((v) => (
              <button
                key={v.key}
                className="menu-item"
                onClick={() => {
                  onVariant(item, v)
                  setMenuPos(null)
                }}
              >
                {v.kind === 'audio' ? <IconMusic size={14} /> : <IconVideo size={14} />}
                {v.label}
              </button>
            ))}
            <div className="menu-sep" />
            <button
              className="menu-item"
              onClick={() => {
                onReprobe(item.url)
                setMenuPos(null)
              }}
            >
              <IconSearch size={14} /> Ré-analyser le lien…
            </button>
          </div>
        </>
      )}
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
      // Reconstructed interrupted download (no URL): show its "Interrompu · … déjà
      // téléchargés" note calmly — it's resumable, not a failure.
      if (!item.url) {
        return (
          <span className="muted">
            <IconAlert size={13} /> {item.result?.error ?? 'Interrompu — à reprendre'}
          </span>
        )
      }
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
