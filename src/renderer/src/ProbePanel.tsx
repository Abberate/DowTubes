import { useMemo, useState } from 'react'
import type { ProbeResult } from '../../shared/types'
import { qualityOptions, subtitleLangs, langLabel, fmtDuration, type QualityOption, type SubtitleChoice } from './lib'
import { IconDownload, IconLock, IconVideo, IconMusic, IconX, IconCaptions } from './icons'

interface Props {
  probe: ProbeResult
  onDownload: (opt: QualityOption, subtitle: SubtitleChoice | null) => void
  onClose: () => void
}

export default function ProbePanel({ probe, onDownload, onClose }: Props): JSX.Element {
  const options = useMemo(() => qualityOptions(probe), [probe])
  const video = options.filter((o) => o.kind === 'video')
  const audio = options.filter((o) => o.kind === 'audio')
  const subs = useMemo(() => subtitleLangs(probe.subtitleLangs, probe.autoCaptionLangs), [probe])

  const [selected, setSelected] = useState<string>(video[0]?.key ?? audio[0]?.key ?? '')
  const [subOn, setSubOn] = useState(false)
  const [subLang, setSubLang] = useState<string>(subs[0]?.code ?? '')
  const [subEmbed, setSubEmbed] = useState(false)

  const chosen = options.find((o) => o.key === selected) ?? options[0]
  const isVideo = chosen?.kind === 'video'
  const canSub = isVideo && subs.length > 0

  function handleDownload(): void {
    if (!chosen) return
    const subtitle: SubtitleChoice | null =
      canSub && subOn && subLang
        ? { lang: subLang, auto: subs.find((s) => s.code === subLang)?.auto ?? false, embed: subEmbed }
        : null
    onDownload(chosen, subtitle)
  }

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

          {canSub && (
            <div className="quality-group">
              <label className="sub-toggle">
                <input type="checkbox" checked={subOn} onChange={(e) => setSubOn(e.target.checked)} />
                <span className="quality-label no-margin">
                  <IconCaptions size={14} /> Sous-titres <span className="sub-count">({subs.length} langues)</span>
                </span>
              </label>
              {subOn && (
                <div className="sub-controls">
                  <select className="sub-select" value={subLang} onChange={(e) => setSubLang(e.target.value)}>
                    {subs.map((s) => (
                      <option key={`${s.code}-${s.auto ? 'a' : 'h'}`} value={s.code}>
                        {langLabel(s.code)}
                        {s.auto ? ' · auto' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="segmented">
                    <button className={!subEmbed ? 'on' : ''} onClick={() => setSubEmbed(false)}>
                      Fichier .srt
                    </button>
                    <button className={subEmbed ? 'on' : ''} onClick={() => setSubEmbed(true)}>
                      Incrustés
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button className="btn-primary probe-dl" onClick={handleDownload}>
            <IconDownload size={17} />
            Télécharger en {chosen?.label}
          </button>
        </>
      )}
    </div>
  )
}
