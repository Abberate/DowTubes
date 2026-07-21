import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { ProbeResult, VersionInfo, DownloadRequest, DownloadResult } from '../../shared/types'
import type { QueueItem, ItemStatus, QualityOption, SubtitleChoice } from './lib'
import { errMsg } from './lib'
import ProbePanel from './ProbePanel'
import DownloadCard from './DownloadCard'
import { IconDownload, IconSearch, IconFolder, IconInbox, IconRefresh, IconAlert, IconClipboard } from './icons'

const MAX_CONCURRENT = 3
const TERMINAL: ItemStatus[] = ['done', 'error', 'canceled']

export default function App(): JSX.Element {
  const [url, setUrl] = useState('')
  const [probing, setProbing] = useState(false)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [probeErr, setProbeErr] = useState('')
  const [items, setItems] = useState<QueueItem[]>([])
  const [outputDir, setOutputDir] = useState('')
  const [versions, setVersions] = useState<VersionInfo | null>(null)
  const [updating, setUpdating] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const itemsRef = useRef<QueueItem[]>([])
  const startedRef = useRef<Set<string>>(new Set())
  const outputDirRef = useRef('')
  const loadedRef = useRef(false)
  const probeTokenRef = useRef(0)

  // ── init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    window.api.defaultOutputDir().then((d) => {
      setOutputDir(d)
      outputDirRef.current = d
    })
    window.api.getVersions().then(setVersions)
    window.api.loadQueue().then((saved) => {
      const restored = (saved as QueueItem[]).map((i) =>
        i.status === 'downloading' || i.status === 'postprocessing' || i.status === 'queued'
          ? { ...i, status: 'queued' as ItemStatus, progress: null }
          : { ...i, progress: null }
      )
      setItems(restored)
      loadedRef.current = true
    })
    // Live progress only drives active items; terminal state is set by runDownload.
    const off = window.api.onProgress((ev) => {
      if (ev.phase !== 'downloading' && ev.phase !== 'postprocessing') return
      setItems((prev) =>
        prev.map((i) =>
          i.id === ev.id && !TERMINAL.includes(i.status) ? { ...i, progress: ev, status: ev.phase } : i
        )
      )
    })
    return off
  }, [])

  // ── scheduler: keep up to MAX_CONCURRENT running ─────────────────────────
  useEffect(() => {
    itemsRef.current = items
    const running = items.filter((i) => i.status === 'downloading' || i.status === 'postprocessing').length
    const slots = MAX_CONCURRENT - running
    if (slots <= 0) return
    const toStart = items.filter((i) => i.status === 'queued' && !startedRef.current.has(i.id)).slice(0, slots)
    if (!toStart.length) return
    toStart.forEach((i) => startedRef.current.add(i.id))
    setItems((prev) => prev.map((i) => (toStart.some((t) => t.id === i.id) ? { ...i, status: 'downloading' } : i)))
    toStart.forEach(runDownload)
  }, [items])

  // ── persistence (save on status/result changes, guarded) ─────────────────
  const saveSig = items.map((i) => `${i.id}:${i.status}:${i.result?.filepath ?? ''}`).join('|')
  useEffect(() => {
    if (!loadedRef.current) return
    const snapshot = items.map((i) => ({ ...i, progress: null }))
    const t = setTimeout(() => window.api.saveQueue(snapshot), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSig])

  // Escape closes the probe panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && probe) closeProbe()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [probe])

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
    try {
      const r = await window.api.probe(target)
      if (token === probeTokenRef.current) setProbe(r)
    } catch (e) {
      if (token === probeTokenRef.current) setProbeErr(errMsg(e))
    } finally {
      if (token === probeTokenRef.current) setProbing(false)
    }
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

  function onDrop(e: React.DragEvent): void {
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
    setUrl('')
  }

  // ── queue actions ─────────────────────────────────────────────────────────
  function addToQueue(opt: QualityOption, subtitle: SubtitleChoice | null): void {
    if (!probe) return
    const sig = `${probe.webpageUrl}|${opt.format}|${opt.audioFormat ?? ''}|${subtitle?.lang ?? ''}|${subtitle?.embed ?? ''}`
    const dupe = itemsRef.current.some(
      (i) =>
        !TERMINAL.includes(i.status) &&
        `${i.url}|${i.format}|${i.audioFormat ?? ''}|${i.subtitle?.lang ?? ''}|${i.subtitle?.embed ?? ''}` === sig
    )
    if (dupe) return
    const item: QueueItem = {
      id: crypto.randomUUID(),
      url: probe.webpageUrl,
      title: probe.title,
      thumbnail: probe.thumbnail,
      qualityLabel: opt.label,
      format: opt.format,
      audioOnly: opt.audioOnly,
      audioFormat: opt.audioFormat,
      mergeFormat: opt.mergeFormat,
      expectedId: probe.id,
      subtitle: subtitle ?? undefined,
      status: 'queued',
      progress: null,
      result: null
    }
    setItems((prev) => [item, ...prev])
  }

  function pauseItem(id: string): void {
    window.api.pause(id)
  }
  function resumeItem(id: string): void {
    // Re-queue; the scheduler restarts it and yt-dlp continues the .part file.
    startedRef.current.delete(id)
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'queued', progress: null, result: null } : i)))
  }
  function pauseAll(): void {
    itemsRef.current.filter((i) => i.status === 'downloading').forEach((i) => window.api.pause(i.id))
  }
  function resumeAll(): void {
    itemsRef.current.filter((i) => i.status === 'paused').forEach((i) => resumeItem(i.id))
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
        setDragOver(true)
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
      </header>

      <div className="add-bar">
        <div className="add-input">
          <IconSearch size={18} className="add-icon" />
          <input
            placeholder="Colle un lien vidéo (YouTube, Vimeo…)"
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
        <button className="btn-primary" onClick={() => doProbe()} disabled={probing || !url.trim()}>
          {probing ? 'Analyse…' : 'Analyser'}
        </button>
      </div>

      {probeErr && (
        <div className="inline-error">
          <IconAlert size={16} /> {probeErr}
        </div>
      )}

      {probe && <ProbePanel key={probe.webpageUrl} probe={probe} onDownload={addToQueue} onClose={closeProbe} />}

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
              onUpdateAndRetry={updateAndRetry}
            />
          ))
        )}
      </div>

      <footer className="status-bar">
        <button
          className="folder-pill"
          onClick={() => window.api.openPath(outputDir)}
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
    </div>
  )
}
