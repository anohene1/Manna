# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project loosely follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Import EasyWorship 6 backups into manna.db _(songs)_
- Implement standalone audio test functionality _(audio)_
- Enhance verse rendering and text wrapping logic
- Per-session audio recording (MP3 64 kbps mono) alongside transcription; click any transcript segment to seek the recorded audio to that moment _(audio)_
- Preflight "Record audio" toggle (default on) wired through `start_transcription` _(preflight)_
- Settings → Storage: list every session with a recording and delete the file + clear the `audio_path` column manually _(settings)_

## [0.1.0-rc2] - 2026-05-23

### Added

- Audit-driven fixes across STT, broadcast, plan, session
- Fullscreen toggle on projector window _(broadcast)_
- Show full stanza lyrics + double-click to go live _(queue)_
- Seed Amplified Bible (AMP) translation _(bible)_
- Enhance activation router and add new plan items

### Changed

- Progress bar, song labels, error visibility

### Documentation

- Log multi-hymnal + simplified setup + release pipeline sessions

### Fixed

- Grant window fullscreen permissions to projector _(broadcast)_

### Maintenance

- Bump version to 0.1.0-rc2

## [0.1.0-rc1] - 2026-04-22

### Added

- Add sermon session models, errors, and database layer _(notes)_
- Add Tauri session commands and wire up manna.db
- Add session types, store, and hook for frontend
- Add design DNA tokens — easing curves, durations, motion preferences
- Add panel tabs component for workspace layout
- Add custom in-app menu bar component
- Add toolbar component with session timer and audio meter
- Replace dashboard with workspace layout — menu bar, toolbar, 3 resizable panels with tabs, collapsible transcript
- Pill-shaped tabs — rounded-full, primary fill on active
- Warm color palette — cream/green light mode, warm dark mode
- Warm queue items — green active state, rounded-xl, readable badges
- Warm detection cards — rounded-xl, serif verse text, pill buttons
- Add broadcast monitor — stacked Preview + Program with TAKE/Off Air
- Restructure right panel — queue tabs + always-visible broadcast monitor
- Plain language CTAs — Preview, Go Live, Clear, Add
- Add shared command registry for menu and palette
- Add native macOS menu with all app commands
- Add hook to bridge native menu events to command registry
- Add Cmd+K command palette with grouped commands
- Replace custom menubar with native menu + Cmd+K command palette
- Wire up preview flow — click verse → preview monitor → Go Live
- Add Go Live button on verse cards for one-click broadcast
- Visual distinction between Preview and On Screen monitors
- Context search cards match book search treatment
- Prev/Next steps through verses in current chapter
- Book search cards show Go Live + Add to Queue buttons below text
- Add to Queue also sends to preview when queue is empty
- Redesign queue cards — verse text preview, Go Live button, click to preview
- Prev/Next syncs selected state in search panel
- Preview auto-loads next verse when stepping through live
- Go Live button shows 'Live' state + auto-scroll on Prev/Next
- Context search cards match book search — buttons below, Live state, selected highlight
- Add Vaul drawer UI primitive
- Add About Manna dialog
- Add End Session confirmation dialog with optional summary
- Add Sessions panel with create form and session list
- Add Export Notes drawer with markdown/JSON format options
- Add Distribute Summary drawer with copy and save
- Add New Announcement dialog with broadcast store integration
- Add panel tabs navigation store with controlled mode
- Wire all remaining menu actions — about, session, export, announce, navigate
- Support FP16 ONNX model output for pre-built Qwen3 exports
- Support MiniLM-L6-v2 as embedding model alongside Qwen3
- Prioritize Qwen3 over MiniLM, adjust threshold to 0.40
- Show confidence percentage on detection cards
- Rank detection cards by confidence (highest first)
- Go Live opens broadcast window on external monitor
- Welcome dialog on first launch — start broadcast or skip
- 4-panel layout — Preview/On Screen gets its own panel
- Add quick controls below broadcast monitors
- Modern styling for broadcast quick controls
- Visual theme selector grid with mini preview cards
- Extend BroadcastTheme with divider/lineBreakMode, add 4 new built-in themes
- Theme persistence — DB table, CRUD methods, Tauri commands
- Canvas renderer supports dividers (line/dots) and centered-lines mode
- Persist custom themes to DB and hydrate on startup
- Preview and On Screen monitors use CanvasVerse — matches broadcast output
- Add divider and line break mode controls to theme designer
- Revamp theme designer UI — modern, compact, Figma-inspired
- Compact theme designer — collapsible sections, inline controls, tighter spacing
- Scripture Cross-Reference Display — Wave 2 Feature 4
- Accordion sections for Theme and Translation in broadcast panel
- Auto-record detections and transcript during live sessions
- Add aggregate analytics queries and Tauri commands
- Analytics dashboard with stat cards, verse frequency chart, recent sessions
- Session detail view with right-click context menus (view/delete)
- Default session title with date and time — editable before creating
- Smarter semantic filtering + verse history tab
- Auto-add 99%+ confidence detections to history tab
- Start Service flow — one click creates session + starts transcription
- Vibrant layered gradient on detection empty state — green, gold, purple radials
- Pre-flight checklist modal before starting service
- Sermon notes panel + session export (clipboard, markdown, JSON, print)
- Session list sorted newest first, editable titles, update_session_title command
- Sermon Planner — search, add, reorder scriptures, load to queue
- Merge Planner into Queue — search + add verses directly in queue
- AI sermon summary — Claude API summarizes transcript for export
- Smarter voice navigation — contains match instead of exact match
- Add AssemblyAIClient skeleton _(stt)_
- AssemblyAI build_url with keyterms_prompt _(stt)_
- AssemblyAI connect loop with reconnect + audio-drop detection _(stt)_
- AssemblyAI try_connect WebSocket send/receive [WIP] _(stt)_
- AssemblyAI JSON parse → TranscriptEvent translation _(stt)_
- Wire AssemblyAI provider into start_transcription _(stt)_
- Add assemblyAiApiKey field and persistence _(settings)_
- Pass correct API key per selected provider _(stt)_
- Add AssemblyAI provider option to Speech section _(settings)_
- Enhance broadcast handling with unique event names and retranslation logic _(broadcast)_
- Add Reconnecting event + parse AssemblyAI words/confidence _(stt)_
- Check AssemblyAI key when that provider is selected _(preflight)_
- Wire stt_reconnecting event end-to-end _(stt)_
- Enhance UI with icons and improve button layout _(broadcast)_
- Verify_deepgram_key + verify_assemblyai_key commands _(stt)_
- Test buttons for Deepgram and AssemblyAI API keys _(settings)_
- Enhance UI with icons and improve button layout _(broadcast)_
- Add scheduled tasks lock file and update environment loading
- Improve transcription handling and UI feedback _(stt)_
- Add Song, SongStanza, LineMode, GeniusHit types _(songs)_
- QueueItem tagged union (verse | song-stanza) _(queue)_
- Add songs table migration + CRUD on SessionDb _(songs)_
- Add Tauri commands for songs CRUD + Genius search/scrape _(songs)_
- Seed 260 GHS hymns at startup (versioned, idempotent) _(songs)_
- Add Genius API token field to settings + store _(songs)_
- Local fuzzy search via minisearch (title/number/author/first-line) + tests _(songs)_
- ExpandSong pure function with tests (TDD) _(songs)_
- SongMeta formatter with tests (TDD) _(songs)_
- Song-store with hydration + CRUD + Genius search/import _(songs)_
- Queue-store learns enqueueSong/jumpLive/jumpToNumber + auto-prune on song delete _(songs)_
- Route song-stanza queue items to broadcast via VerseRenderData adapter _(songs)_
- Queue row shows verse/song badge _(songs)_
- Songs panel scaffold + song row + empty state + stubs _(songs)_
- Genius results list with import action _(songs)_
- Paste-lyrics dialog saves custom songs _(songs)_
- Song detail drawer with toggles + stanza enqueue _(songs)_
- Cmd+G quick-jump dialog + mount Songs panel in workspace _(songs)_
- Add service_plan SQLite schema + Rust types _(plan)_
- Add cascade trigger for session-scoped plan items _(plan)_
- Add template CRUD methods on SessionDb _(plan)_
- Add item CRUD + clone/template-load methods _(plan)_
- Register Tauri commands for service plan _(plan)_
- Add service-plan TypeScript types + parser _(plan)_
- Zustand store + 7 unit tests _(plan)_
- Use-service-plan hook bridging store + Tauri commands _(plan)_
- Activation router with 4 unit tests _(plan)_
- Add-item dropdown menu (section/announcement/blank) _(plan)_
- Item editor dialog (announcement + section + auto-advance) _(plan)_
- Item row with icon/label/edit/delete/active indicator _(plan)_
- Main panel UI with drag-reorder + keyboard nav _(plan)_
- Template manager dialog (save/list/load) _(plan)_
- Add Plan tab to right workspace panel _(plan)_
- Auto-advance timer wiring + 2 new store tests _(plan)_
- Extend Song type with tune/meter/scriptureRef/category + hymnal source consts _(hymnals)_
- Extend songs table with tune/meter/scripture_ref/category + per-source methods _(hymnals)_
- Add HymnalDef registry with 4 placeholder JSON bundles _(hymnals)_
- Generic seed_hymnals() reads enabled set from settings + per-hymnal seed_version _(hymnals)_
- Tauri commands seed_hymnal, delete_hymnal_songs, list_hymnal_counts _(hymnals)_
- Add enabledHymnals to settings store with persistence _(hymnals)_
- Prep:hymnals script + GHS adapter (relocate ghs.json to hymnals/) _(hymnals)_
- Sankey scraper (traditionalmusic.co.uk) — site unreachable at build time _(hymnals)_
- MHB adapter (reads pre-OCR'd raw JSON from scripts/hymnals/.source/) _(hymnals)_
- Source badges + numeric prefix search (mhb 42) + enabled filter + drawer metadata _(hymnals)_
- SDA adapter + attribution (Apache-2.0 GospelSounders/adventhymnals) _(hymnals)_
- Welcome picker wizard + Settings Hymnals section _(hymnals)_
- Add announcement system with duration and dismissal functionality _(broadcast)_
- Add setup:minimal, setup:semantic, setup:whisper recipes _(setup)_
- Add tauri-plugin-updater + tauri-plugin-process _(release)_
- MANNA_FLAVOR compile env + get_flavor Tauri command _(release)_
- Per-flavor Tauri config files (minimal, full) with updater endpoints _(release)_
- Resolve_resource helper + bundle-aware paths for DB/ONNX/embeddings _(release)_
- Welcome wizard step 3 — API key entry (Deepgram/AssemblyAI, skippable) _(onboarding)_
- Updater frontend — auto-check on launch (24hr debounce) + manual button in Settings _(release)_
- Build-updater-manifest.py — sign installers + emit latest-<flavor>.json _(release)_
- GitHub Actions workflow — matrix build (macOS-minimal, macOS-full, windows-minimal) + release aggregator _(release)_

### Changed

- Parallelize hydration, default provider back to deepgram _(settings)_
- Extract addToHistory + use ref for cooldown timer _(broadcast)_
- Log warn on corrupt item_type fallback in get_plan _(plan)_
- Phase-subset architecture + GPU pre-flight _(setup)_

### Documentation

- Add Manna feature design spec
- Add Wave 1 implementation plan — session model + UI revamp
- Add technical learnings and execution log from Wave 1 session
- Add UI polish design spec — Soft & Inviting aesthetic
- Add UI polish implementation plan — 10 tasks
- Add multi-translation embeddings and model upgrade to backlog
- Update execution log and learnings from full Wave 1 session
- Add overlay themes design spec — Wave 2 Feature 5
- Add overlay themes implementation plan — 8 tasks
- Add Verse History & Analytics design spec — Wave 2 Feature 3
- Add Verse History & Analytics implementation plan — 5 tasks
- Log AssemblyAI provider integration
- Rewrite README for Manna fork — features, STT providers, sermon workflow, verify commands
- Add app-shell section + session persistence, shared ws_runtime, analytics/history/crossref panels _(readme)_
- Trim README Features to Manna-only highlights, add wiki comparison
- Correct parse_tens note — upstream has no parse_tens; Manna introduced and fixed its own bug _(wiki)_
- Highlight UI redesign as primary fork differentiator
- Mark overlay themes as shipped _(backlog)_
- Mark songs tab as shipped (pending smoke test) _(backlog)_
- Log Service Plan ship + INT8 embedding fallback revert
- Rewrite Getting Started with decision matrix + feature matrix + minimal-first flow _(setup)_
- RELEASE.md runbook + mark DMG/EXE pipeline shipped _(release)_

### Fixed

- Correct react-resizable-panels v4 API usage and panel overflow
- Strip card wrappers from panels for workspace layout
- Remove panel IDs to prevent stale localStorage layout cache
- Use defaultLayout on Group for correct panel proportions
- Use percentage strings for panel sizes (v4 requires CSS units)
- Make search panel header responsive — stack vertically, wrap controls
- Polish headers, toolbar badge, menu bar warmth
- Register --font-serif in @theme block so Tailwind emits the utility
- Detection CTAs — Send to Screen + Add to Queue
- Tooltips show on top to avoid blocking clicks, remove Preview button from detections
- Smaller detection card buttons — xs size, 10px text
- Consistent selected state — primary color border/bg on both search types
- Preview and live are independent
- Compact queue cards — single-line verse, inline actions, tighter padding
- Search panel selected state syncs with broadcast Prev/Next
- Search panel scroll — replace fragment with flex container for proper height constraint
- Panel tabs content overflow-auto instead of overflow-hidden to allow scrolling
- Sticky search controls — only verse list scrolls
- Syntax error — extra closing bracket
- Add native Edit menu for Cmd+C/V/X/A clipboard support on macOS
- Lower semantic detection threshold from 0.50 to 0.35 for MiniLM model
- Detection cards ordered by recency, not confidence
- Rename Rhema NDI to Manna Broadcast in window titles
- Disable auto-queue — detections only go to queue via manual action
- Reduce semantic detection noise — only emit top result above 50%
- Show top 3 semantic results instead of 1
- On Screen above Preview, taller Prev/Next buttons, smaller center minSize
- More gap in theme grid and translation pills, bigger translation buttons
- Switching translation re-fetches live and preview verses
- Remove announcement button from broadcast panel
- Go Live on detection cards — skip preview to avoid race condition
- Hide AMP from translation selector (0 verses in DB)
- Wire ThemeDesigner component into workspace — was missing after toolbar refactor
- Theme editor bugs — divider crash, updatedAt, missing layout controls
- Cross-references query — use integer columns not string from_ref
- Add vertical padding to accordion content
- Use correct Claude model ID for summarization
- Use claude-haiku-4-5 model ID (cheapest, correct format)
- Improve summarization prompt — handle short/fragmented transcripts gracefully
- Retry with fallback model on API overload, clean up summarize module
- AssemblyAI send keepalive during silence _(stt)_
- AssemblyAI avoid double Disconnected on Termination _(stt)_
- Remove bogus "one" → 100 mapping in parse_tens _(detection)_
- Genius lyrics parser splits on [Verse N] markers + strips header junk _(songs)_
- Row hover buttons + smaller detail drawer + direct-to-live broadcast _(songs)_
- Next/Prev buttons advance song stanzas (was bailing on non-Bible reference) _(songs)_
- Drawer Go Live broadcasts immediately + closes drawer _(songs)_
- Parser rejects non-structure bracket markers (e.g. [Produced by X]) _(songs)_
- Per-line navigation uses stored expandedIndex + text (was showing same first line) _(songs)_
- Song detail drawer centers properly (override inset-x-0 from base class) _(songs)_
- Cmd+G skips handler when typing in input/textarea/contentEditable _(songs)_
- Wrap GHS seed in explicit transaction (atomic 260-row insert) _(songs)_
- Bound Genius body read to 15s + 2MB (prevent slow-stream hangs) _(songs)_
- Song-delete subscription preserves active cursor by item id _(songs)_
- Confirm before deleting custom/Genius songs _(songs)_
- Validate finite order_index + non-negative auto_advance_seconds _(plan)_
- Tauri.conf before* commands use 'bun run <script>', not 'bun <subcommand>' _(release)_
- Drop tsc from 'build' script — vite build only _(release)_
- Drop '--' separator for bun run + PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0 for full _(release)_
- Skip macos-full on CI + drop whisper feature on Windows _(release)_
- Windows must use '-- --no-default-features' (cargo flag, not Tauri's) _(release)_
- Make onnx feature toggleable on app crate for Windows CI _(release)_
- Restrict bundle targets per-OS (nsis on Windows, dmg on macOS) _(release)_
- Surface tauri signer sign stdout/stderr on failure _(release)_
- Install deps in release job so 'bun x tauri' resolves _(release)_
- Drop --private-key flag; let signer read env var TAURI_SIGNING_PRIVATE_KEY _(release)_
- Skip manifest for missing flavors + tolerate missing files on publish _(release)_

### Maintenance

- Add phosphor-icons, react-resizable-panels, vaul
- Rebrand from Rhema to Manna — window title, product name, identifier
- Add mock detections for UI testing (remove before production)
- Add tauri-plugin-dialog for file save dialogs
- Add tauri-plugin-fs for file write operations
- Sync all pending changes from Wave 1 testing session
- Sync pending changes from Wave 2 session
- Add ASSEMBLYAI_API_KEY to env template
- Rename package from rhema to manna
- Cliff.toml — auto-generated changelog grouping by conventional commits _(release)_
- Bump to v0.1.0-rc1 (release pipeline smoke test)

### Tests

- Integration tests for template + item DB layer _(plan)_
- Coverage for update_notes, update_item, delete_item, NotFound paths, copy-field assertions _(plan)_


