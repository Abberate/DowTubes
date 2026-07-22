import { useEffect, useRef, useState, type DragEvent } from 'react'
import type {
  ProbeResult,
  VersionInfo,
  DownloadRequest,
  DownloadResult,
  PlaylistInfo,
  AppSettings
} from '../../shared/types'
import type { QueueItem, ItemStatus, QualityOption, SubtitleChoice } from './lib'
import { errMsg } from './lib'
import ProbePanel from './ProbePanel'
import DownloadCard from './DownloadCard'
import SettingsModal from './Settings'
import {
  IconDownload,
  IconSearch,
  IconFolder,
  IconInbox,
  IconRefresh,
  IconAlert,
  IconClipboard,
  IconSettings
} from './icons'

const TERMINAL: ItemStatus[] = ['done', 'error', 'canceled']
const CONCURRENCY_KEY = 'dowtubes.concurrency'
const DEFAULT_SETTINGS: AppSettings = { notify: true, embedMetadata: true, embedThumbnail: true }

function looksLikePlaylist(u: string): boolean {
  return /[?&]list=|\/playlist|\/@|\/channel\/|\/c\/|\/user\//i.test(u)
}

export default function App(): JSX.Element {
  const [url, setUrl] = useState('')
  const [probing, setProbing] = useState(false)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null)
  const [probeErr, setProbeErr] = useState('')
  const [items, setItems] = useState<QueueItem[]>([])
  const [outputDir, setOutputDir] = useState('')
  const [versions, setVersions] = useState<VersionInfo | null>(null)
  const [updating, setUpdating] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [concurrency, setConcurrencyValue] = useState<number>(() => {
    const v = Number(localStorage.getItem(CONCURRENCY_KEY))
    return v >= 1 && v <= 5 ? v : 3
  })

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemsRef = useRef<QueueItem[]>([])
  const startedRef = useRef<Set<string>>(new Set())
  const outputDirRef = useRef('')
  const loadedRef = useRef(false)
  const probeTokenRef = useRef(0)
  const dragIdRef = useRef<string | null>(null)
  const internalDragRef = useRef(false)

  // ── init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    window.api.defaultOutputDir().then((d) => {
      setOutputDir(d)
      outputDirRef.current = d
    })
    window.api.getVersions().then(setVersions)
    window.api.getSettings().then(setSettings)
    window.api.loadQueue().then((saved) => {
      const restored = (saved as QueueItem[]).map((i) =>
        i.status === 'downloading' || i.status === 'postprocessing' || i.status === 'queued'
          ? { ...i, status: 'queued' as ItemStatus, progress: null }
          : { ...i, progress: null }
      )
      setItems(restored)
      loadedRef.current = true
    })
    const off = window.api.onProgress((ev) => {
      if (ev.phase !== 'downloading' && ev.phase !== 'postprocessing') return
      setItems((prev) =>
        prev.map((i) =>
          i.id === ev.id && !TERMINAL.includes(i.status) ? { ...i, progress: ev, status: ev.phase } : i
        )
      )
    })
    const offSettings = window.api.onOpenSettings(() => setSettingsOpen(true))
    return () => {
      off()
      offSettings()
    }
  }, [])

  // ── scheduler ─────────────────────────────────────────────────────────────
  useEffect(() => {
    itemsRef.current = items
    const running = items.filter((i) => i.status === 'downloading' || i.status === 'postprocessing').length
    const slots = concurrency - running
    if (slots <= 0) return
    const toStart = items.filter((i) => i.status === 'queued' && !startedRef.current.has(i.id)).slice(0, slots)
    if (!toStart.length) return
    toStart.forEach((i) => startedRef.current.add(i.id))
    setItems((prev) => prev.map((i) => (toStart.some((t) => t.id === i.id) ? { ...i, status: 'downloading' } : i)))
    toStart.forEach(runDownload)
  }, [items, concurrency])

  // ── persistence ─────────────────────────────────────────────────────────
  const saveSig = items.map((i) => `${i.id}:${i.status}:${i.result?.filepath ?? ''}`).join('|')
  useEffect(() => {
    if (!loadedRef.current) return
    const snapshot = items.map((i) => ({ ...i, progress: null }))
    const t = setTimeout(() => window.api.saveQueue(snapshot), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSig])

  // Escape closes the settings modal, then the probe panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (settingsOpen) setSettingsOpen(false)
      else if (probe) closeProbe()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [probe, settingsOpen])

  async function runDownload(item: QueueItem): Promise<void> {
    const req: DownloadRequest = {
      id: item.id,
      url: item.url,
      title: item.title,
      format: item.format,
      audioOnly: item.audioOnly,
      audioFormat: item.audioFormat,
      mergeFormat: item.mergeFormat,
      outputDir: outputDirRef.current,
      expectedId: item.expectedId,
      subtitle: item.subtitle
    }
    let res: DownloadResult
    try {
      res = await window.api.download(req)
    } catch (e) {
      res = { id: item.id, ok: false, filepath: null, error: errMsg(e), errorKind: 'unknown' }
    }
    startedRef.current.delete(item.id)
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              status: res.ok
                ? 'done'
                : res.errorKind === 'canceled'
                  ? 'canceled'
                  : res.errorKind === 'paused'
                    ? 'paused'
                    : 'error',
              result: res.errorKind === 'paused' ? null : res,
              progress: null
            }
          : i
      )
    )
  }

  // ── entry ────────────────────────────────────────────────────────────────
  async function doProbe(value?: string): Promise<void> {
    const target = (value ?? url).trim()
    if (!target) return
    const token = ++probeTokenRef.current
    setProbing(true)
    setProbeErr('')
    setProbe(null)
    setPlaylist(null)
    if (looksLikePlaylist(target)) {
      window.api
        .probePlaylist(target)
        .then((pl) => {
          if (token === probeTokenRef.current) setPlaylist(pl)
        })
        .catch(() => {})
    }
    try {
      const r = await window.api.probe(target)
      if (token === probeTokenRef.current) setProbe(r)
    } catch (e) {
      if (token === probeTokenRef.current) setProbeErr(errMsg(e))
    } finally {
      if (token === probeTokenRef.current) setProbing(false)
    }
  }

  function cancelProbe(): void {
    probeTokenRef.current++ // ignore the in-flight result
    window.api.cancelProbe()
    setProbing(false)
  }

  async function pasteAndProbe(): Promise<void> {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (/^https?:\/\//i.test(text)) {
        setUrl(text)
        doProbe(text)
      } else if (text) {
        setUrl(text)
      }
    } catch {
      /* clipboard permission denied — ignore */
    }
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault()
    setDragOver(false)
    const raw = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    const link = raw
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /^https?:\/\//i.test(l))
    if (link) {
      setUrl(link)
      doProbe(link)
    }
  }

  function closeProbe(): void {
    setProbe(null)
    setPlaylist(null)
    setUrl('')
  }

  // ── queue actions ─────────────────────────────────────────────────────────
  function newItem(
    src: { url: string; title: string; thumbnail: string | null; id: string },
    opt: QualityOption,
    subtitle: SubtitleChoice | null
  ): QueueItem {
    return {
      id: crypto.randomUUID(),
      url: src.url,
      title: src.title,
      thumbnail: src.thumbnail,
      qualityLabel: opt.label,
      format: opt.format,
      audioOnly: opt.audioOnly,
      audioFormat: opt.audioFormat,
      mergeFormat: opt.mergeFormat,
      expectedId: src.id,
      subtitle: subtitle ?? undefined,
      status: 'queued',
      progress: null,
      result: null
    }
  }

  function dupeKey(i: { url: string; format: string; audioFormat?: string; subtitle?: SubtitleChoice }): string {
    return `${i.url}|${i.format}|${i.audioFormat ?? ''}|${i.subtitle?.lang ?? ''}|${i.subtitle?.embed ?? ''}`
  }

  function showToast(msg: string): void {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  function addToQueue(opt: QualityOption, subtitle: SubtitleChoice | null): void {
    if (!probe) return
    const item = newItem(
      { url: probe.webpageUrl, title: probe.title, thumbnail: probe.thumbnail, id: probe.id },
      opt,
      subtitle
    )
    const active = new Set(itemsRef.current.filter((i) => !TERMINAL.includes(i.status)).map(dupeKey))
    if (active.has(dupeKey(item))) {
      showToast('Déjà dans la liste')
    } else {
      setItems((prev) => [item, ...prev])
      showToast('Téléchargement ajouté')
    }
    closeProbe()
  }

  // Download another variant (audio, other quality) of an already-listed item — no re-probe.
  function addVariant(src: QueueItem, opt: QualityOption): void {
    const item = newItem(
      { url: src.url, title: src.title, thumbnail: src.thumbnail, id: src.expectedId ?? '' },
      opt,
      null
    )
    const active = new Set(itemsRef.current.filter((i) => !TERMINAL.includes(i.status)).map(dupeKey))
    if (active.has(dupeKey(item))) {
      showToast('Déjà dans la liste')
      return
    }
    setItems((prev) => [item, ...prev])
    showToast(`${opt.label} ajouté`)
  }

  function reprobe(url: string): void {
    setUrl(url)
    doProbe(url)
  }

  function addPlaylistToQueue(opt: QualityOption, subtitle: SubtitleChoice | null): void {
    if (!playlist) return
    const active = new Set(itemsRef.current.filter((i) => !TERMINAL.includes(i.status)).map(dupeKey))
    const fresh = playlist.entries
      .map((e) => newItem({ url: e.url, title: e.title, thumbnail: null, id: e.id }, opt, subtitle))
      .filter((i) => !active.has(dupeKey(i)))
    if (fresh.length) {
      setItems((prev) => [...fresh, ...prev])
      showToast(`${fresh.length} vidéo${fresh.length > 1 ? 's' : ''} ajoutée${fresh.length > 1 ? 's' : ''}`)
    }
    closeProbe()
  }

  function pauseItem(id: string): void {
    window.api.pause(id)
  }
  function resumeItem(id: string): void {
    startedRef.current.delete(id)
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'queued', progress: null, result: null } : i)))
  }
  function pauseAll(): void {
    itemsRef.current.filter((i) => i.status === 'downloading').forEach((i) => window.api.pause(i.id))
  }
  function resumeAll(): void {
    itemsRef.current.filter((i) => i.status === 'paused').forEach((i) => resumeItem(i.id))
  }
  function startNow(id: string): void {
    setItems((prev) => {
      const it = prev.find((i) => i.id === id)
      return it ? [it, ...prev.filter((i) => i.id !== id)] : prev
    })
  }
  // Drag-to-reorder the queue.
  function reorderStart(id: string): void {
    dragIdRef.current = id
    internalDragRef.current = true
    setDraggingId(id)
  }
  function reorderOver(overId: string): void {
    const dragId = dragIdRef.current
    if (!dragId || dragId === overId) return
    setItems((prev) => {
      const from = prev.findIndex((i) => i.id === dragId)
      const to = prev.findIndex((i) => i.id === overId)
      if (from < 0 || to < 0 || from === to) return prev
      const copy = [...prev]
      const [moved] = copy.splice(from, 1)
      copy.splice(to, 0, moved)
      return copy
    })
  }
  function reorderEnd(): void {
    dragIdRef.current = null
    internalDragRef.current = false
    setDraggingId(null)
  }
  function removeItem(id: string): void {
    const it = itemsRef.current.find((i) => i.id === id)
    if (it && (it.status === 'downloading' || it.status === 'postprocessing')) window.api.cancel(id)
    startedRef.current.delete(id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }
  function retryItem(id: string): void {
    startedRef.current.delete(id)
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'queued', progress: null, result: null } : i)))
  }
  function clearFinished(): void {
    itemsRef.current.filter((i) => TERMINAL.includes(i.status)).forEach((i) => startedRef.current.delete(i.id))
    setItems((prev) => prev.filter((i) => !TERMINAL.includes(i.status)))
  }
  async function updateEngine(): Promise<void> {
    setUpdating(true)
    try {
      await window.api.updateEngine()
      setVersions(await window.api.getVersions())
    } finally {
      setUpdating(false)
    }
  }
  async function updateAndRetry(id: string): Promise<void> {
    await updateEngine()
    retryItem(id)
  }

  // ── settings ──────────────────────────────────────────────────────────────
  function updateSettings(patch: Partial<AppSettings>): void {
    setSettings((s) => ({ ...s, ...patch }))
    window.api.setSettings(patch)
  }
  function changeConcurrency(n: number): void {
    setConcurrencyValue(n)
    localStorage.setItem(CONCURRENCY_KEY, String(n))
  }
  function openFolder(): void {
    window.api.openPath(outputDir)
  }
  async function changeFolder(): Promise<void> {
    const d = await window.api.pickFolder()
    if (d) {
      setOutputDir(d)
      outputDirRef.current = d
    }
  }

  const activeCount = items.filter((i) => i.status === 'downloading' || i.status === 'postprocessing').length
  const downloadingCount = items.filter((i) => i.status === 'downloading').length
  const pausedCount = items.filter((i) => i.status === 'paused').length
  const finishedCount = items.filter((i) => TERMINAL.includes(i.status)).length
  const ytOk = versions ? !/indisponible|inconnu/i.test(versions.ytdlp) : false

  return (
    <div
      className={`app ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!internalDragRef.current) setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">
            <IconDownload size={20} />
          </div>
          <div className="brand-text">
            <h1>DowTubes</h1>
            <span>Téléchargeur vidéo &amp; audio</span>
          </div>
        </div>
        <button className="icon-btn header-btn" title="Réglages" aria-label="Réglages" onClick={() => setSettingsOpen(true)}>
          <IconSettings size={19} />
        </button>
      </header>

      <div className="add-bar">
        <div className="add-input">
          <IconSearch size={18} className="add-icon" />
          <input
            placeholder="Colle un lien vidéo ou une playlist (YouTube, Vimeo…)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doProbe()}
            spellCheck={false}
            autoFocus
          />
          <button className="icon-btn add-paste" title="Coller le lien" aria-label="Coller le lien" onClick={pasteAndProbe}>
            <IconClipboard size={16} />
          </button>
        </div>
        {probing ? (
          <button className="btn-ghost btn-tall" onClick={cancelProbe}>
            Annuler
          </button>
        ) : (
          <button className="btn-primary" onClick={() => doProbe()} disabled={!url.trim()}>
            Analyser
          </button>
        )}
      </div>

      {probeErr && (
        <div className="inline-error">
          <IconAlert size={16} /> {probeErr}
        </div>
      )}

      {probe && (
        <ProbePanel
          key={probe.webpageUrl}
          probe={probe}
          playlist={playlist}
          onDownload={addToQueue}
          onDownloadAll={addPlaylistToQueue}
          onClose={closeProbe}
        />
      )}

      <div className="list-head">
        <h2>
          Téléchargements {items.length > 0 && <span className="count">{items.length}</span>}
          {activeCount > 0 && <span className="active-count">{activeCount} en cours</span>}
        </h2>
        <div className="list-actions">
          {downloadingCount > 1 && (
            <button className="link-btn" onClick={pauseAll}>
              Tout mettre en pause
            </button>
          )}
          {pausedCount > 1 && (
            <button className="link-btn" onClick={resumeAll}>
              Tout reprendre
            </button>
          )}
          {finishedCount > 0 && (
            <button className="link-btn" onClick={clearFinished}>
              Effacer terminés
            </button>
          )}
        </div>
      </div>

      <div className="list">
        {items.length === 0 ? (
          <div className="empty">
            <IconInbox size={40} />
            <p>Aucun téléchargement</p>
            <span>Colle ou dépose un lien ci-dessus pour commencer.</span>
            <span className="empty-credit">Développé par B.A Abdoulaye</span>
          </div>
        ) : (
          items.map((it) => (
            <DownloadCard
              key={it.id}
              item={it}
              onPause={pauseItem}
              onResume={resumeItem}
              onRetry={retryItem}
              onRemove={removeItem}
              onReveal={(p) => window.api.reveal(p)}
              onOpen={(p) => window.api.openPath(p)}
              onStartNow={startNow}
              onUpdateAndRetry={updateAndRetry}
              onVariant={addVariant}
              onReprobe={reprobe}
              dragging={it.id === draggingId}
              onReorderStart={reorderStart}
              onReorderOver={reorderOver}
              onReorderEnd={reorderEnd}
            />
          ))
        )}
      </div>

      <footer className="status-bar">
        <button
          className="folder-pill"
          onClick={openFolder}
          aria-label={`Ouvrir le dossier de sortie : ${outputDir}`}
          title={outputDir}
        >
          <IconFolder size={14} />
          <span>{outputDir.split('/').pop() || 'Dossier'}</span>
        </button>
        <button className="link-btn" onClick={changeFolder}>
          Changer
        </button>

        <div className="status-spacer" />

        <div className="engine-status">
          <span className={`dot ${ytOk ? 'ok' : 'bad'}`} />
          <span className="mono">yt-dlp {versions?.ytdlp?.split(' ')[0] ?? '…'}</span>
          <span className="sep">·</span>
          <span className="mono">ffmpeg {versions?.ffmpeg?.split(' ')[0] ?? '…'}</span>
          <button className="link-btn" onClick={updateEngine} disabled={updating}>
            <IconRefresh size={13} /> {updating ? 'MàJ…' : 'Mettre à jour'}
          </button>
        </div>
      </footer>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          concurrency={concurrency}
          outputDir={outputDir}
          version={versions?.app ?? ''}
          onChange={updateSettings}
          onConcurrency={changeConcurrency}
          onChangeFolder={changeFolder}
          onOpenFolder={openFolder}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
