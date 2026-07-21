# DowTubes

Téléchargeur vidéo & audio multiplateforme (macOS d'abord, Windows en Phase 6), à la manière de Downie.
Interface Electron + TypeScript + React au-dessus des moteurs **yt-dlp** (extraction) et **ffmpeg** (montage/conversion).

## Prérequis

- Node.js 22+
- Accès réseau (le premier `npm install` télécharge le binaire yt-dlp de la plateforme)

## Démarrer

```bash
npm install        # installe les deps + télécharge yt-dlp dans resources/bin/
npm run dev        # lance l'app en développement (HMR)
```

## Scripts

| Commande | Effet |
|----------|-------|
| `npm run dev` | Lance l'app en mode dev (rechargement à chaud) |
| `npm run build` | Compile main + preload + renderer dans `out/` |
| `npm run preview` | Prévisualise le build de production |
| `npm run typecheck` | Vérifie les types (main + renderer) |

## Architecture

- **`src/main/`** — process principal (Node). Fenêtre, IPC, orchestration, appels yt-dlp/ffmpeg.
- **`src/preload/`** — pont sécurisé (`contextBridge`) : la seule API que le renderer peut appeler.
- **`src/renderer/`** — UI React (Chromium sandboxé, sans accès direct à Node/fs).
- **`src/shared/`** — types partagés à travers la frontière IPC.
- **`scripts/fetch-ytdlp.mjs`** — récupère le binaire yt-dlp de la plateforme (postinstall).

### Règles de sécurité (non négociables)

1. Renderer **sandboxé** (`sandbox`, `contextIsolation`, `nodeIntegration:false`) — aucun accès direct à `fs`/`child_process`.
2. yt-dlp/ffmpeg lancés en **tableau d'arguments**, jamais en chaîne shell.
3. yt-dlp copié dans `Application Support/DowTubes/bin` et mis à jour **là**, jamais dans le `.app` signé.

## Feuille de route

Phase 0 (fondations) ✅ · 1 (moteur) · 2 (UI + file) · 3 (formats/audio) · 4 (sous-titres) · 5 (polish) · 6 (packaging mac+win).
