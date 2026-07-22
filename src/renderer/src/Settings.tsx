import type { AppSettings } from '../../shared/types'
import { IconX, IconDownload } from './icons'

interface Props {
  settings: AppSettings
  concurrency: number
  outputDir: string
  version: string
  onChange: (patch: Partial<AppSettings>) => void
  onConcurrency: (n: number) => void
  onChangeFolder: () => void
  onOpenFolder: () => void
  onClose: () => void
}

export default function Settings({
  settings,
  concurrency,
  outputDir,
  version,
  onChange,
  onConcurrency,
  onChangeFolder,
  onOpenFolder,
  onClose
}: Props): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Réglages">
        <div className="modal-head">
          <h2>Réglages</h2>
          <button className="icon-btn" title="Fermer" aria-label="Fermer" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>Dossier de téléchargement</span>
            <span className="setting-hint" title={outputDir}>{outputDir}</span>
          </div>
          <div className="setting-ctl">
            <button className="btn-ghost" onClick={onOpenFolder}>Ouvrir</button>
            <button className="btn-ghost" onClick={onChangeFolder}>Changer…</button>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>Téléchargements simultanés</span>
            <span className="setting-hint">Nombre de téléchargements en parallèle</span>
          </div>
          <select
            className="sub-select mini"
            value={concurrency}
            onChange={(e) => onConcurrency(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>Cookies du navigateur</span>
            <span className="setting-hint">
              Contre le message « confirmez que vous n'êtes pas un robot » de YouTube. Choisis le
              navigateur où tu es connecté à YouTube.
            </span>
          </div>
          <select
            className="sub-select mini"
            value={settings.cookiesBrowser}
            onChange={(e) => onChange({ cookiesBrowser: e.target.value as AppSettings['cookiesBrowser'] })}
          >
            <option value="">Aucun</option>
            <option value="safari">Safari</option>
            <option value="chrome">Chrome</option>
            <option value="brave">Brave</option>
            <option value="edge">Edge</option>
            <option value="chromium">Chromium</option>
            <option value="firefox">Firefox</option>
            <option value="opera">Opera</option>
            <option value="vivaldi">Vivaldi</option>
          </select>
        </div>

        <Toggle label="Notifications à la fin d'un téléchargement" checked={settings.notify} onChange={(v) => onChange({ notify: v })} />
        <Toggle label="Intégrer les métadonnées (titre, auteur…)" checked={settings.embedMetadata} onChange={(v) => onChange({ embedMetadata: v })} />
        <Toggle label="Intégrer la pochette dans les MP3" checked={settings.embedThumbnail} onChange={(v) => onChange({ embedThumbnail: v })} />

        <div className="modal-about">
          <div className="about-logo">
            <IconDownload size={20} />
          </div>
          <div className="about-text">
            <div className="about-name">DowTubes{version ? ` · v${version}` : ''}</div>
            <div className="about-credit">
              Développé par <b>B.A Abdoulaye</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <label className="setting-row toggle-row">
      <span className="setting-label">
        <span>{label}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}
