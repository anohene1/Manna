# Manna

Real-time AI-powered Bible verse detection for live sermons and broadcasts. A Tauri v2 desktop app with a React frontend and Rust backend.

Manna listens to a live sermon audio feed, transcribes speech in real time, detects Bible verse references (both explicit citations and quoted passages), and renders them to a projector or NDI program feed. The main output can also combine a local camera, capture card, or NDI video source with responsive Bible and song-lyric lower thirds.

> Manna is a friendly fork of [openbezal/rhema](https://github.com/openbezal/rhema), extended for church livestream workflows: multi-provider STT, service plan + session management, camera composition, editable lower thirds, song presentation, AI sermon summaries + live notes, image search → projection, and an API-key verifier.

---

## What Manna adds

> Built on [openbezal/rhema](https://github.com/openbezal/rhema)'s detection ensemble, NDI FFI, theme schema, Bible data pipeline, and audio capture. Manna inherited the architecture, then tuned thresholds, prioritized Qwen3 over MiniLM, added a shared WebSocket runtime (Deepgram + AssemblyAI), revamped the theme designer UI, extended the Bible DB (Amplified + multi-hymnal seeding + EasyWorship import), and layered the church-livestream workflow on top.

<!-- screenshots: add before/after images here -->

### Redesigned UI

Rhema ships a fixed 4-column CSS grid with 6 hardcoded panels. Manna replaces this with:

- **Resizable panel workspace** (`react-resizable-panels`) with draggable dividers; right column is vertically split — Queue/History/Cross-refs tabs on top, **pinned Service Plan** on the bottom (resizable)
- **Warm earth-tone OKLCH palette** — Manna shifts from rhema's green-lime primary (`oklch(0.53 0.16 131)` on pure white) to a warmer scheme (`oklch(0.45 0.1 155)` on warm off-white `oklch(0.965 0.008 75)`) with a full dark-mode overhaul
- **Motion system** — spring, smooth, and snap easing curves with duration tokens (`--ease-spring`, `--duration-fast`, etc.)
- **Bottom-sheet drawers** as the default for task workflows (Vaul) — announcement, service-plan-item editor, broadcast settings, template manager, notes selection, paste lyrics. Centered Dialog reserved for confirms / quick-jumps / launchers.
- **Settings as full-screen overlay** — sidebar nav + content pane, replaces the old 800×600 modal
- **Bible picker grids** — Books grid (OT/NT) → Chapters grid → existing verse list, breadcrumb back-nav. Popover combobox kept for power users.
- **Command palette** (cmdk) for keyboard-driven navigation
- **Native app menu** bridged to in-app actions
- **Sonner toasts** for non-blocking feedback

### Service Plan + sessions workflow

- **Sessions-first landing screen** — fresh launch shows a sessions list and "Start a new session" card, not the workspace
- **Sessions Mode overlay** — full-screen takeover w/ landing list + per-session detail (Summary / Transcript / Detections / Stats). Home icon in toolbar opens it.
- **Service Plan panel** with drag-reorderable items of multiple kinds:
  - `verse` — Bible verse w/ translation
  - `song` — hymnal / online song lookup w/ stanza presentation
  - `announcement` — ticker (scrolling bottom strip) or full slide; presets, mode cards, duration pills, live preview
  - `notes` — selectable bullet slide (see below)
  - `blank` — logo or custom image
  - `momo` / `jesus` — preset full-screen images
  - `section` — visual divider
- **Plan-item activation** opens an edit drawer; "Save & Go Live" is one click
- **Persistent sessions** — transcript, detections, notes saved per service (SQLite), resumable across restarts
- **Auto-preflight from landing** — submitting "Start a new session" creates the session in `planned` status, then the preflight checklist opens; Start Service in preflight stamps `startedAt` (timer begins precisely there) and kicks off transcription
- **Pre-flight checklist** — mic / API key / network checks before recording starts

### Notes (manual + AI)

- **Notes panel** with markdown bold/italic inline rendering
- **AI "Generate points" button** — DeepSeek extracts 1-2 NEW personal-note-style bullets from transcript-so-far (no reported speech). Operator-triggered, not automatic.
- **Notes Plan Item** — a service plan kind that opens a Vaul drawer; operator picks notes (click-ordered ordinals), optional title, live preview, **Go Live** or **Update slide** (replaces Go Live when this item is already on screen). Notes can be added/edited inline from the drawer.
- **Themed projection** — canvas renderer paints numbered chips, accent-rule title, word-wrapped bullets

### Projection pipeline

- **Main-output camera mode** — use a webcam, HDMI/USB capture card, or discovered NDI source as the program background. Controls include source preview, crop-to-fill/contain, mirroring, connection status, and explicit Start/Stop actions.
- **Camera-aware output controls** — Clear Output becomes **Clear Verse** while camera mode is active, so the video remains live. Full-screen images, notes, blank screens, and slide announcements temporarily take over and reveal the camera again when dismissed. Alternate output remains independent.
- **Lower-third theme system** — three canvas presets plus ten built-in HTML/CSS templates. Long content auto-fits, text boxes grow with the content, active tickers lift the lower third, gradients render as real gradients, and the church logo remains available as a persistent program layer.
- **Scripture/song awareness** — song stanzas are tagged separately from Bible verses, so HTML lower thirds use song labels and suppress translation-only metadata instead of presenting lyrics as scripture.
- **Custom HTML templates** — import a static `.html` file, duplicate/edit it in Theme Designer, use syntax highlighting and Prettier formatting, then select it from Camera Input. See the [HTML lower-third specification](docs/html-lower-third-spec.md) for placeholders, conditional classes, safety restrictions, and a starter template.
- **Program preview** — the operator monitor receives a low-rate compressed preview of the composited camera program without opening a second local-camera stream.
- **Image search → live** — Pexels, Unsplash, Brave image providers; `presentImageLive` pipes selection straight to `setFullscreenImage` on the broadcast store
- **Default-to-blank projector boot** — branded logo screen on session start, no black void
- **Projector picker** w/ proportional monitor arrangement view
- **Custom image upload** on blank-slide plan items (file picker → embedded URL)
- **Announcement runtime** — ticker (continuous right-edge-to-left-edge RAF marquee; current program stays visible) or slide (full takeover). Pause/Resume/Dismiss + countdown chips on the broadcast monitor header and on the active plan item.
- **Verse motion** — subtle enter/exit movement and fading in both camera lower-thirds and normal slide mode.

### AI / summaries

- **DeepSeek API** powers both end-of-session sermon summaries and the live "Generate points" notes — replaces the original Anthropic Claude integration (cheaper, OpenAI-compatible, falls back from `deepseek-chat` to `deepseek-reasoner`)
- **Structured summary** — JSON shape (topic, key verses, main points, takeaways, quotes) persisted to the session row; rendered as cards in the Summary tab
- **Operator-confirmed verses** flow into the prompt as `key_verses` ground truth

### STT + reliability

- **AssemblyAI Universal-Streaming** as a second provider, alongside Deepgram + Whisper
- **One-click API-key verifier** — HTTP auth probe + WebSocket handshake, inline ✓ / ✗ (Deepgram, AssemblyAI, DeepSeek)
- **Shared WebSocket runtime** — Deepgram + AssemblyAI share one connect/reconnect loop
- **Proper reconnect semantics** — `stt_reconnecting` vs `stt_disconnected` so transient drops don't tear down the UI
- **Keepawake** — laptop won't sleep while Manna is open (dropped on quit)

**→ [Full feature comparison with file pointers](docs/wiki/Manna-vs-Rhema.md)**

---

## Tech Stack

| Layer            | Technologies                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**     | React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Vaul (drawers), Sonner (toasts), Zustand, Vite 7                                                                                        |
| **Backend**      | Tauri v2, Rust (workspace with 7 crates)                                                                                                                                                  |
| **AI / ML**      | ONNX Runtime (Qwen3-0.6B embeddings), Aho-Corasick, Fuse.js, MiniSearch, **DeepSeek** (sermon summaries + live notes — OpenAI-compatible, `deepseek-chat` / `deepseek-reasoner` fallback) |
| **Database**     | SQLite via rusqlite (bundled) with FTS5                                                                                                                                                   |
| **Broadcast**    | Canvas 2D composition, MediaDevices camera capture, NDI 6 input/output via dynamically loaded FFI                                                                                         |
| **STT**          | Deepgram + AssemblyAI (WebSocket via tokio-tungstenite, shared ws_runtime), Whisper (local, `ggml-large-v3-turbo`)                                                                        |
| **Image search** | Pexels, Unsplash, Brave Search Image API                                                                                                                                                  |

### Rust crates

| Crate             | Purpose                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `rhema-audio`     | Audio device enumeration, capture, VAD (cpal)                                                                         |
| `rhema-stt`       | STT providers (Deepgram, AssemblyAI, Whisper) + shared WebSocket runtime                                              |
| `rhema-bible`     | SQLite Bible DB, FTS5 search, cross-references                                                                        |
| `rhema-detection` | Verse detection pipeline: direct, semantic, quotation, ensemble merger, sentence buffer, sermon context, reading mode |
| `rhema-broadcast` | Shared-lifetime NDI SDK loader, source discovery, video receiver, and binary program-frame output                     |
| `rhema-api`       | Tauri command API layer                                                                                               |
| `rhema-notes`     | Session notes + sermon-notes types                                                                                    |

> Crate names still carry the `rhema-` prefix upstream; the app's package name and bundle identifier are `manna`.

---

## Prerequisites

- [Bun](https://bun.sh/) — runtime for scripts + package manager
- [Rust](https://rustup.rs/) toolchain (stable, 1.85+)
- [CMake](https://cmake.org/) — required to build the local Whisper backend
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) — platform-specific system deps
- [Python 3.11+](https://www.python.org/) — managed automatically by Phase 1 of any setup recipe
- **One STT provider**:
  - [Deepgram API key](https://deepgram.com/) — Nova-3, keyword boosting
  - [AssemblyAI API key](https://assemblyai.com/) — Universal-Streaming v3, cheaper ($0.15 / hr), strong proper-noun accuracy
  - Or Whisper (no key, runs locally — `bun run setup:whisper`)
- [DeepSeek API key](https://platform.deepseek.com/) — optional, powers the AI sermon summary and the "Generate points" live notes (very cheap; sermon summary ≈ $0.001/run)
- **Optional image search providers** — any combination of:
  - [Pexels API key](https://www.pexels.com/api/) — free
  - [Unsplash API key](https://unsplash.com/developers) — free
  - [Brave Search API key](https://brave.com/search/api/) — free tier
- [Genius API token](https://genius.com/api-clients) — optional, song lookup via the Songs panel

### Resource requirements

- **Disk:** 2 GB minimal, 6 GB full (Qwen3 ONNX + KJV embeddings + Whisper model)
- **Network:** ~2 GB download minimal, ~4 GB full
- **GPU:** required only for `setup:semantic`. Auto-detected (MPS on Mac, CUDA on Linux). CPU fallback requires explicit `FORCE_CPU=1` — takes 10+ hours for KJV precompute.

---

## Getting Started

```bash
git clone https://github.com/uxderrick/Manna.git
cd Manna
bun install
```

### Which setup do I need?

| Scenario             | Recipe                  | Time    | Disk |
| -------------------- | ----------------------- | ------- | ---- |
| Church PC (no GPU)   | `bun run setup:minimal` | ~10 min | 2 GB |
| Mac M1/M2/M3 (MPS)   | `bun run setup:all`     | ~45 min | 6 GB |
| Linux + NVIDIA       | `bun run setup:all`     | ~30 min | 6 GB |
| CI / quick dev check | `bun run setup:minimal` | ~10 min | 2 GB |

### What each setup gives you

| Feature                                       | minimal | + semantic | + whisper |
| --------------------------------------------- | ------- | ---------- | --------- |
| Bible lookup (search, nav)                    | ✓       | ✓          | ✓         |
| Direct reference detection ("John 3:16")      | ✓       | ✓          | ✓         |
| Quotation detection (exact KJV wording)       | ✓       | ✓          | ✓         |
| Semantic detection (paraphrase, loose quotes) | —       | ✓          | ✓         |
| Cloud STT (Deepgram, AssemblyAI)              | ✓       | ✓          | ✓         |
| Local Whisper STT (offline, free)             | —       | —          | ✓         |

### Minimal install (~10 min)

```bash
bun run setup:minimal
bun run tauri dev
```

App is fully functional — direct + quotation verse detection active. For semantic detection or local Whisper STT, run the optional upgrades below.

### Optional: semantic detection (~30–45 min on GPU)

Adds Qwen3 ONNX precompute for paraphrase detection. **Requires GPU** — pre-flight check aborts on CPU.

```bash
bun run setup:semantic
# CPU fallback (not recommended, 10+ hours):
FORCE_CPU=1 bun run setup:semantic
```

### Optional: local Whisper STT (~3 min, 1 GB)

Downloads Whisper model for offline transcription. Alternative to cloud STT keys.

```bash
bun run setup:whisper
```

### Full setup (all phases)

Runs minimal + semantic + whisper + copyrighted BibleGateway translations in one go.

```bash
bun run setup:all
bun run setup:all --force   # re-run even if artifacts exist
```

### Environment

Create a `.env` file in the project root:

```
DEEPGRAM_API_KEY=your_key_here
ASSEMBLYAI_API_KEY=your_key_here
DEEPSEEK_API_KEY=your_key_here       # optional — AI sermon summary + live "Generate points" notes
PEXELS_API_KEY=your_key_here         # optional — image search → live projection
UNSPLASH_API_KEY=your_key_here       # optional — image search alternative
BRAVE_API_KEY=your_key_here          # optional — image search alternative
GENIUS_API_KEY=your_key_here         # optional — song lookup
```

Keys can also be entered in **Settings → API Keys** inside the app and verified with the **Test** button (Deepgram, AssemblyAI, DeepSeek).

### NDI SDK (optional)

Required for NDI input or output. The command downloads the headers and platform runtimes into the gitignored `sdk/ndi/` directory:

```bash
bun run download:ndi-sdk
```

In development, the Rust loader reads the runtime directly from `sdk/ndi/<platform>/`. Production installers bundle only the current platform's runtime; on macOS the dylib lives in the app's signable `Frameworks` directory, while Windows and Linux resolve it from application resources. Run the download command before a local production build; the release workflow does this automatically.

### Run in development

```bash
bun run tauri dev
```

Development defaults to the `minimal` flavor marker, but it compiles Cargo's default ONNX and Whisper features and falls back to files in the project root. If models, embeddings, Whisper, or the NDI SDK already exist locally, the dev app will use them. Running `tauri dev` does not run `setup:minimal` or `setup:all`; setup recipes only create/download resources.

### Build for production

Use a flavor configuration so the required runtime data is embedded in the installer:

| Flavor    | Bundled resources                                                      | Intended use                                     |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `minimal` | Bible database                                                         | Direct/quotation detection with cloud STT        |
| `context` | Bible database, INT8 Qwen tokenizer/model, KJV embeddings              | Semantic/context detection without local Whisper |
| `full`    | Bible database, FP32 + INT8 Qwen assets, KJV embeddings, Whisper model | All local capabilities; largest installer        |

macOS DMG:

```bash
MANNA_FLAVOR=minimal bun run tauri build --bundles dmg --config src-tauri/tauri.conf.minimal.json
```

The installer is written to `src-tauri/target/release/bundle/dmg/`.

For another flavor, first create its resources, then change both occurrences of the flavor name:

```bash
bun run setup:all
MANNA_FLAVOR=full bun run tauri build --bundles dmg --config src-tauri/tauri.conf.full.json
```

Windows NSIS installer (run on Windows; MSI does not accept the current prerelease version):

```powershell
$env:MANNA_FLAVOR="minimal"
bun run tauri build --bundles nsis --config src-tauri/tauri.conf.minimal.json -- --no-default-features
```

The installer is written to `src-tauri/target/release/bundle/nsis/`. Local builds are unsigned; see [Release installation notes](docs/RELEASE.md#user-facing-install-docs) for macOS Gatekeeper and Windows SmartScreen guidance.

For a quick frontend production bundle without compiling the native application, use:

```bash
bun run build
```

### Advanced: running individual phases

The orchestrator accepts a `--phases=<csv>` flag. Valid phase ids:

| Phase | id              | What it does                                       |
| ----- | --------------- | -------------------------------------------------- |
| 1     | `venv`          | Python `.venv` + pip deps                          |
| 2     | `bible-data`    | Download scrollmapper + cross-refs                 |
| 3     | `biblegateway`  | Download copyrighted translations (NIV, ESV, etc.) |
| 4     | `build-db`      | Build `data/rhema.db` (SQLite + FTS5)              |
| 5     | `onnx`          | Download + quantize Qwen3 ONNX model               |
| 6     | `export-verses` | Export KJV verses → JSON                           |
| 7     | `precompute`    | Compute KJV embeddings (GPU required)              |
| 8     | `whisper`       | Download Whisper STT model                         |

```bash
bun run setup:all --phases=venv,bible-data,build-db
bun run setup:all --phases=biblegateway   # add NIV/ESV/etc. later
bun run setup:all --force                 # bypass artifact idempotency
```

Individual legacy scripts (`download:bible-data`, `build:bible`, `download:model`, `export:verses`, `download:whisper`) still work if you prefer running them directly.

---

## Using Manna

### Before the service

1. **Settings → API Keys** — paste keys for Deepgram or AssemblyAI (STT), DeepSeek (AI), Pexels/Unsplash/Brave (image search), Genius (songs). Click **Test** on Deepgram / AssemblyAI / DeepSeek to verify.
2. **Settings → Speech Recognition** — pick the STT provider (Deepgram / AssemblyAI / Whisper).
3. **Settings → Audio** — pick the input device and check the gain meter.
4. **Settings → Bible** — set the active translation.
5. **Settings → Display Mode** — choose manual vs auto-broadcast, set the confidence threshold and cooldown.
6. **Settings → Hymnals** — toggle which hymnal sources are seeded into the local song DB.
7. **Settings → Branding** — set the church name and logo used by blank screens and camera programs.
8. Open **Theme Designer** to choose or customize normal slide themes and camera lower thirds. HTML lower thirds can be imported from the theme library.

### During the service

1. From the **sessions landing screen**, fill in title (speaker / series optional) → submit. The session is created in `planned` status; the pre-flight checklist opens automatically.
2. Pre-flight runs:
   - ✓ Audio device available
   - ✓ Selected provider API key configured
   - ✓ Network reachable
3. Click **Start Service** in the checklist → session promoted to `live` (timer starts here), transcription begins, detection pipeline emits verses as they're mentioned.
4. **Auto mode** broadcasts the top-confidence verse automatically (respecting the cooldown). **Manual mode** shows candidates; you click a verse or use the Queue to go live.
5. The **Queue** doubles as a sermon planner — search, reorder, and load verses ahead of time, or build it on the fly.
6. **Service Plan** (bottom of right column) holds your pre-planned items. Click ▶ on any item to send it live (verse, song, image, announcement, notes, blank).
7. **Notes panel** — type bullets (markdown bold/italic). Click **Generate points** any time to have DeepSeek summarise the transcript-so-far as 1-2 NEW operator-style bullets. To project: add a `Notes` item to the Service Plan, ▶ to open the selection drawer, pick bullets (click-ordered), optionally set a title, **Go Live**. Later edits use **Update slide**.
8. **Announcements** — ticker (scrolling bottom band) or full slide; pause/resume/dismiss inline.
9. Verses that cross the 99% threshold are auto-added to the **History** tab; presented verses are persisted to the session.

### Camera and lower-thirds workflow

1. Open the **Broadcast Monitor**, then select **Camera**.
2. Choose **Local device** for a webcam/capture card or **NDI** for a discovered network source. Refresh discovery if the device was connected after opening the drawer.
3. Select crop-to-fill or contain, toggle mirroring if needed, choose a lower-third theme, and click **Start Camera**. Camera activation is intentionally not restored after an app restart.
4. Present a Bible verse or song stanza normally. The camera stays behind the lower third; song lyrics receive song-specific labels while scripture keeps its translation metadata.
5. Use **Clear Verse** to remove only the lower third, or **Stop Camera** to end the video stream and release its tracks.

The selected source identity, fit, mirroring, and lower-third theme are remembered. If a selected source disappears, Manna reports the error rather than silently switching to another camera. NDI source loss renders black behind any active lower third and keeps the selected source identity for reconnection.

Camera composition applies only to the main output. The program priority is: slide announcement → full-screen image/notes/blank → camera with optional verse or lyrics → normal themed slide/black.

On macOS, allow camera access when prompted (`NSCameraUsageDescription` is included). On Windows, camera access must be enabled for desktop apps in Privacy settings. Device discovery may initially show generic labels until permission has been granted.

### HTML lower thirds

- Import a `.html` file from **Theme Designer → Import**. JavaScript, iframes, embedded objects, event handlers, `javascript:` URLs, external stylesheets, and CSS imports are removed.
- Edit templates in the built-in syntax-highlighted HTML/CSS editor. Use **Format**, `Shift+Alt+F`, or `Ctrl/Cmd+Shift+F` to run Prettier; Tab inserts two spaces.
- Templates can distinguish `scripture` from `song` through placeholders and root CSS classes. Translation-only elements can automatically disappear for lyrics.
- Design for a transparent 1920×1080 canvas and add `data-manna-lower-third` to the moving overlay container so active tickers lift it automatically.

See [docs/html-lower-third-spec.md](docs/html-lower-third-spec.md) and [public/templates/lower-third-example.html](public/templates/lower-third-example.html) for the complete contract and an importable example.

### After the service

- **End Service** confirmation dialog → transcription stops, session is finalised, DeepSeek summary fires in the background, and Sessions Mode jumps to the new Summary tab.
- **Summary tab** renders the AI summary as cards (Topic / Key Verses / Main Points / 5 Takeaways / Quotes).
- **Export** — clipboard / markdown / JSON / print from the session detail.
- **Distribute summary** drawer — save or copy the summary for sharing.

---

## Project Structure

```
manna/
├── src/                          # React frontend
│   ├── components/
│   │   ├── broadcast/            # Theme designer, camera input, HTML editor, broadcast monitor/settings, projector picker
│   │   ├── controls/             # Transport bar
│   │   ├── layout/               # Workspace, toolbar, sessions-landing
│   │   ├── notes/                # Notes selection drawer
│   │   ├── panels/               # transcript, preview, live-output, queue, search, detections,
│   │   │                         # sessions, session-detail, notes, history, analytics,
│   │   │                         # cross-ref, service-plan-panel, service-plan-item, service-plan-item-editor,
│   │   │                         # songs, images
│   │   ├── service-plan/         # add-item-menu, activation-router, template-manager, add-verse / add-song dialogs
│   │   ├── session/              # end-session-dialog, export-notes drawer, distribute-summary drawer
│   │   ├── songs/                # song-detail-drawer, online-song-preview-drawer, song-jump-dialog, paste-lyrics drawer
│   │   ├── settings-dialog.tsx   # Settings UI (Audio, Speech, Bible, Display, Hymnals, Remote, API Keys, Help)
│   │   ├── preflight-checklist.tsx
│   │   └── ui/                   # shadcn/ui + custom (drawer, dialog, sidebar, command, sonner toaster, etc.)
│   ├── broadcast-output.tsx      # Projector/program compositor — camera, lower thirds, slides, branding, ticker, NDI output
│   ├── hooks/                    # useAudio, useTranscription, useDetection, useBible, useBroadcast, useCameraEvents, ...
│   ├── stores/                   # Zustand stores (audio, transcript, bible, queue, detection, broadcast,
│   │                             #                  settings, session, service-plan, song, panel-tabs, ...)
│   ├── types/                    # TypeScript type definitions
│   └── lib/                      # Canvas renderers/composition, camera helpers, HTML lower-third sanitizer/renderer,
│                                 # theme presets, context search, Bible helpers, session and AI-note utilities
├── src-tauri/                    # Rust backend (Tauri v2)
│   ├── crates/
│   │   ├── audio/                # Audio capture & metering (cpal)
│   │   ├── stt/                  # STT providers
│   │   │   ├── deepgram.rs       # Deepgram Nova-3 streaming
│   │   │   ├── assemblyai.rs     # AssemblyAI Universal-Streaming v3
│   │   │   ├── whisper.rs        # Local Whisper (optional feature)
│   │   │   ├── ws_runtime.rs     # Shared WebSocket connect/reconnect loop
│   │   │   └── keyterms.rs       # Bible keyterm lists for prompt boosting
│   │   ├── bible/                # SQLite Bible DB, search, cross-references
│   │   ├── detection/            # Verse detection pipeline
│   │   │   ├── direct/           # Aho-Corasick + fuzzy reference parsing
│   │   │   ├── semantic/         # ONNX embeddings, HNSW index, cloud booster, ensemble
│   │   │   └── reading_mode.rs   # Reading vs referencing classifier
│   │   ├── broadcast/            # NDI SDK lifetime, source discovery/input receiver, output sender (FFI)
│   │   ├── api/                  # Tauri command API
│   │   └── notes/                # Session + sermon note types
│   ├── src/commands/             # Tauri command handlers
│   ├── tauri.conf.json           # Shared/base Tauri configuration
│   └── tauri.conf.*.json         # Minimal, context, and full resource overlays
├── data/                         # Bible data pipeline
│   ├── prepare-embeddings.ts     # Unified setup orchestrator (bun run setup:all)
│   ├── lib/python-env.ts         # Shared Python venv management utilities
│   ├── download-sources.ts       # Download public domain translations + cross-refs
│   ├── download-biblegateway.py  # Download copyrighted translations (NIV, ESV, etc.)
│   ├── build-bible-db.ts         # Build SQLite DB from JSON sources
│   ├── compute-embeddings.ts     # Export verses to JSON for embedding
│   ├── precompute-embeddings.py  # Precompute embeddings (GPU auto-detect, ONNX fallback)
│   ├── download-model.ts         # Export & quantize Qwen3 ONNX model
│   ├── download-ndi-sdk.ts       # Download NDI SDK libraries
│   └── schema.sql                # Database schema
├── models/                       # ML models (gitignored)
├── embeddings/                   # Precomputed vectors (gitignored)
├── sdk/ndi/                      # Downloaded NDI SDK headers/runtimes (gitignored)
├── public/templates/             # Importable lower-third examples
└── build/                        # Vite build output
```

---

## Scripts

| Script                       | Description                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `setup:minimal`              | **Recommended first run** — Python venv + Bible data + DB + verse export (~10 min, no GPU) |
| `setup:semantic`             | Add ONNX model + KJV embedding precompute (~30–45 min, GPU required)                       |
| `setup:whisper`              | Add offline Whisper STT model (~3 min, 1 GB)                                               |
| `setup:all`                  | **Full setup** — all 8 phases (idempotent)                                                 |
| `dev`                        | Start Vite dev server (port 3000)                                                          |
| `tauri`                      | Run Tauri CLI commands (`bun run tauri dev` / `bun run tauri build`)                       |
| `build`                      | Vite production frontend build                                                             |
| `build:typed`                | TypeScript project build followed by the Vite production build                             |
| `test`                       | Run Vitest tests                                                                           |
| `lint`                       | ESLint                                                                                     |
| `format`                     | Prettier formatting                                                                        |
| `typecheck`                  | TypeScript type checking                                                                   |
| `preview`                    | Preview production build                                                                   |
| `download:bible-data`        | Download public domain Bible translations + cross-references                               |
| `build:bible`                | Build SQLite Bible database from JSON sources                                              |
| `convert:twi`                | Convert the Twi Bible XML source into the normalized JSON format                           |
| `download:model`             | Export Qwen3-Embedding-0.6B to ONNX + quantize to INT8                                     |
| `export:verses`              | Export KJV verses to JSON for embedding precomputation                                     |
| `precompute:embeddings`      | Precompute embeddings via Rust ONNX binary                                                 |
| `precompute:embeddings-onnx` | Precompute embeddings via Python ONNX Runtime                                              |
| `precompute:embeddings-py`   | Precompute embeddings via Python sentence-transformers                                     |
| `quantize:model`             | Quantize ONNX model to INT8 for ARM64                                                      |
| `download:ndi-sdk`           | Download NDI 6 SDK headers and platform libraries                                          |

---

## Environment Variables

Create a `.env` file in the project root:

| Variable             | Required                  | Description                                                     |
| -------------------- | ------------------------- | --------------------------------------------------------------- |
| `DEEPGRAM_API_KEY`   | One required (or Whisper) | Deepgram speech-to-text                                         |
| `ASSEMBLYAI_API_KEY` | One required (or Whisper) | AssemblyAI speech-to-text                                       |
| `DEEPSEEK_API_KEY`   | Optional                  | AI sermon summary on session end + live "Generate points" notes |
| `PEXELS_API_KEY`     | Optional                  | Image search → live projection                                  |
| `UNSPLASH_API_KEY`   | Optional                  | Image search alternative                                        |
| `BRAVE_API_KEY`      | Optional                  | Image search alternative                                        |
| `GENIUS_API_KEY`     | Optional                  | Song lookup                                                     |

Keys pasted into **Settings → API Keys** are persisted via `tauri-plugin-store` and override the `.env` values.

---

## Tauri commands (selected)

| Command                                                                                              | Purpose                                                 |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `start_transcription` / `stop_transcription`                                                         | Audio → STT → detection pipeline lifecycle              |
| `verify_deepgram_key` / `verify_assemblyai_key` / `verify_deepseek_key`                              | HTTP auth + WebSocket handshake probe for the given key |
| `detect_verses` / `semantic_search` / `quotation_search`                                             | Detection pipeline entry points                         |
| `reading_mode_status` / `stop_reading_mode`                                                          | Reading-mode classifier controls                        |
| `create_session` / `start_session` / `end_session` / `list_sessions` / `delete_session`              | Session lifecycle                                       |
| `update_session_title` / `update_session_summary`                                                    | Session metadata                                        |
| `add_session_detection` / `record_presented_verse` / `get_session_detections`                        | Verse detection + "went on screen" recording            |
| `add_session_transcript` / `get_session_transcript`                                                  | Transcript persistence                                  |
| `add_session_note` / `update_session_note` / `get_session_notes`                                     | Notes CRUD (manual + AI rows)                           |
| `summarize_sermon` / `generate_live_notes`                                                           | DeepSeek-backed AI summaries + live "Generate points"   |
| `plan_get` / `plan_add_item` / `plan_update_item` / `plan_delete_item` / `plan_reorder_item`         | Service plan CRUD                                       |
| `plan_list_templates` / `plan_save_template` / `plan_load_template_into_session`                     | Service plan templates                                  |
| `ensure_broadcast_window` / `open_broadcast_window` / `close_broadcast_window` / `is_broadcast_open` | Broadcast output window                                 |
| `list_monitors` / `primary_monitor`                                                                  | Projector picker (monitor enumeration)                  |
| `start_ndi` / `stop_ndi` / `get_ndi_status` / `push_ndi_frame_binary`                                | NDI program output over bounded binary IPC              |
| `list_ndi_sources` / `start_ndi_input` / `stop_ndi_input`                                            | NDI source discovery and receiver lifecycle             |
| `get_ndi_input_status` / `pull_ndi_frame`                                                            | Receiver health and latest-frame-only binary transport  |
| `start_osc` / `start_http` / `update_remote_status`                                                  | Remote control (OSC + HTTP)                             |
| `list_custom_themes` / `save_custom_theme` / `delete_custom_theme`                                   | Theme designer persistence                              |
| `seed_hymnal` / `list_songs` / `save_song` / `delete_song`                                           | Songs + hymnal seeding                                  |

---

## Contributing

Issues and pull requests welcome. This is a personal fork tested against a live church livestream workflow; changes that help other churches ship on Sunday are especially appreciated.

## License

See [LICENSE](LICENSE). Upstream attribution: [openbezal/rhema](https://github.com/openbezal/rhema).
