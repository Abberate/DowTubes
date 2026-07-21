import { useMemo, useState } from 'react'
import type { ProbeResult } from '../../shared/types'
import { qualityOptions, fmtDuration, type QualityOption } from './lib'
import { IconDownload, IconLock, IconVideo, IconMusic, IconX } from './icons'

interface Props {
  probe: ProbeResult
  onDownload: (opt: QualityOption) => void
  onClose: () => void
}

export default function ProbePanel({ probe, onDownload, onClose }: Props): JSX.Element {
  const options = useMemo(() => qualityOptions(probe), [probe])
  const video = options.filter((o) => o.kind === 'video')
  const audio = options.filter((o) => o.kind === 'audio')
  const [selected, setSelected] = useState<string>(video[0]?.key ?? audio[0]?.key ?? '')

  const chosen = options.find((o) => o.key === selected) ?? options[0]

  return (
    <div className="probe-panel">
      <button className="probe-close icon-btn" title="Fermer" onClick={onClose}>
        <IconX size={16} />
      </button>

      <div className="probe-preview">
        <div className="probe-thumb">
          {probe.thumbnail ? <img src={probe.thumbnail} alt="" /> : <IconVideo size={28} />}
        </div>
        <div className="probe-info">
          <div className="probe-title">{probe.title}</div>
          <div className="probe-meta">
            {probe.uploader ?? 'Source inconnue'} · {fmtDuration(probe.durationSeconds)}
          </div>
        </div>
      </div>

      {probe.hasDrm ? (
        <div className="drm-banner">
          <IconLock size={18} />
          <span>Contenu protégé par DRM — le téléchargement est refusé par conception.</span>
        </div>
      ) : (
        <>
          <div className="quality-group">
            <div className="quality-label">
              <IconVideo size={14} /> Vidéo
            </div>
            <div className="quality-grid">
              {video.map((o) => (
                <button
                  key={o.key}
                  className={`quality-chip ${selected === o.key ? 'on' : ''}`}
                  onClick={() => setSelected(o.key)}
                >
                  <span className="q-label">{o.label}</span>
                  <span className="q-sub">{o.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="quality-group">
            <div className="quality-label">
              <IconMusic size={14} /> Audio seul
            </div>
            <div className="quality-grid">
              {audio.map((o) => (
                <button
                  key={o.key}
                  className={`quality-chip ${selected === o.key ? 'on' : ''}`}
                  onClick={() => setSelected(o.key)}
                >
                  <span className="q-label">{o.label}</span>
                  <span className="q-sub">{o.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary probe-dl" onClick={() => chosen && onDownload(chosen)}>
            <IconDownload size={17} />
            Télécharger en {chosen?.label}
          </button>
        </>
      )}
    </div>
  )
}
