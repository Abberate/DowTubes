import { useEffect, useRef, useState } from 'react'
import type { ProbeResult, VersionInfo, DownloadRequest, DownloadResult } from '../../shared/types'
import type { QueueItem, ItemStatus, QualityOption } from './lib'
import { errMsg } from './lib'
import ProbePanel from './ProbePanel'
import DownloadCard from './DownloadCard'
import { IconDownload, IconSearch, IconFolder, IconInbox, IconRefresh, IconAlert } from './icons'

const MAX_CONCURRENT = 3

export default function App(): JSX.Element {
  const [url, setUrl] = useState('')
  const [probing, setProbing] = useState(false)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [probeErr, setProbeErr] = useState('')
  const [items, setItems] = useState<QueueItem[]>([])
  const [outputDir, setOutputDir] = useState('')
  const [versions, setVersions] = useState<VersionInfo | null>(null)
  const [updating, setUpdating] = useState(false)

  const itemsRef = useRef<QueueItem[]>([])
  const startedRef = useRef<Set<string>>(new Set())
  const outputDirRef = useRef('')
  const loadedRef = useRef(false)

  // ── init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    window.api.defaultOutputDir().then((d) => {
      setOutputDir(d)
      outputDirRef.current = d
    })
    window.api.getVersions().then(setVersions)
    window.api.loadQueue().then((saved) => {
      // Restore the list; interrupted (non-terminal) items become 'queued' so the
      // scheduler auto-resumes them (yt-dlp continues partial .part files).
      const restored = (saved as QueueItem[]).map((i) =>
        i.status === 'downloading' || i.status === 'postprocessing' || i.status === 'queued'
          ? { ...i, status: 'queued' as ItemStatus, progress: null }
          : { ...i, progress: null }
      )
      setItems(restored)
      loadedRef.current = true
    })
    const off = window.api.onProgress((ev) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== ev.id || i.status === 'done' || i.status === 'error' || i.status === 'canceled') return i
          const status: ItemStatus = ev.phase === 'postprocessing' ? 'postprocessing' : 'downloading'
          return { ...i, progress: ev, status }
        })
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

  // ── persistence: save on status/result changes (not on every progress tick) ──
  const saveSig = items.map((i) => `${i.id}:${i.status}:${i.result?.filepath ?? ''}`).join('|')
  useEffect(() => {
    if (!loadedRef.current) return
    const snapshot = items.map((i) => ({ ...i, progress: null }))
    const t = setTimeout(() => window.api.saveQueue(snapshot), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSig])

  async function runDownload(item: QueueItem): Promise<void> {
    const req: DownloadRequest = {
      id: item.id,
      url: item.url,
      format: item.format,
      audioOnly: item.audioOnly,
      audioFormat: item.audioFormat,
      mergeFormat: item.mergeFormat,
      outputDir: outputDirRef.current,
      expectedId: item.expectedId
    }
    let res: DownloadResult
    try {
      res = await window.api.download(req)
    } catch (e) {
      res = { id: item.id, ok: false, filepath: null, error: errMsg(e), errorKind: 'unknown' }
    }
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, status: res.ok ? 'done' : res.errorKind === 'canceled' ? 'canceled' : 'error', result: res }
          : i
      )
    )
  }

  // ── actions ──────────────────────────────────────────────────────────────
  async function doProbe(): Promise<void> {
    if (!url.trim()) return
    setProbing(true)
    setProbeErr('')
    setProbe(null)
    try {
      setProbe(await window.api.probe(url.trim()))
    } catch (e) {
      setProbeErr(errMsg(e))
    } finally {
      setProbing(false)
    }
  }

  function addToQueue(opt: QualityOption): void {
    if (!probe) return
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
      status: 'queued',
      progress: null,
      result: null
    }
    setItems((prev) => [item, ...prev])
    setProbe(null)
    setUrl('')
  }

  function cancelItem(id: string): void {
    window.api.cancel(id)
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
    setItems((prev) => prev.filter((i) => !['done', 'error', 'canceled'].includes(i.status)))
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

  const finishedCount = items.filter((i) => ['done', 'error', 'canceled'].includes(i.status)).length
  const ytOk = versions ? !/indisponible|inconnu/i.test(versions.ytdlp) : false

  return (
    <div className="app">
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
          />
        </div>
        <button className="btn-primary" onClick={doProbe} disabled={probing || !url.trim()}>
          {probing ? 'Analyse…' : 'Analyser'}
        </button>
      </div>

      {probeErr && (
        <div className="inline-error">
          <IconAlert size={16} /> {probeErr}
        </div>
      )}

      {probe && <ProbePanel probe={probe} onDownload={addToQueue} onClose={() => setProbe(null)} />}

      <div className="list-head">
        <h2>Téléchargements {items.length > 0 && <span className="count">{items.length}</span>}</h2>
        {finishedCount > 0 && (
          <button className="link-btn" onClick={clearFinished}>
            Effacer terminés
          </button>
        )}
      </div>

      <div className="list">
        {items.length === 0 ? (
          <div className="empty">
            <IconInbox size={40} />
            <p>Aucun téléchargement</p>
            <span>Colle un lien ci-dessus pour commencer.</span>
          </div>
        ) : (
          items.map((it) => (
            <DownloadCard
              key={it.id}
              item={it}
              onCancel={cancelItem}
              onRetry={retryItem}
              onRemove={removeItem}
              onReveal={(p) => window.api.reveal(p)}
            />
          ))
        )}
      </div>

      <footer className="status-bar">
        <button className="folder-pill" onClick={async () => {
          const d = await window.api.pickFolder()
          if (d) { setOutputDir(d); outputDirRef.current = d }
        }} title={outputDir}>
          <IconFolder size={14} />
          <span>{outputDir.split('/').pop() || 'Dossier'}</span>
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
