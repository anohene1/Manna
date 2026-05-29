# Manna vs Rhema — feature comparison

Manna is a friendly fork of [openbezal/rhema](https://github.com/openbezal/rhema). This page is the authoritative list of what's shared, what Manna adds, and what Manna changes.

If a feature isn't listed under **Manna additions** or **Manna changes**, the architecture comes from rhema. Many such features have Manna fingerprints on top — tuning, bug fixes, and small extensions — called out inline in the **Inherited** section.

---

## UI redesign

The most visible difference. Manna is not a reskin — it's a different layout, panel system, color scheme, and interaction model.

| Dimension | Rhema (upstream) | Manna |
| --- | --- | --- |
| **Layout** | Fixed CSS grid (`gridTemplateRows: 56px 2fr 3fr`, 4 columns). All 6 panels visible at once, no resizing. | `react-resizable-panels` workspace with draggable dividers. Right column vertically split — Queue/History/Cross-refs tabs on top, **pinned Service Plan** on the bottom. Tabbed panel bar across left/center/right slots. |
| **Panels** | 6: transcript, preview, live-output, queue, search, detections | 15+: + sessions, session-detail, notes, history, analytics, cross-reference, songs, images, service-plan-panel + service-plan-item editors |
| **Color palette** | Green-lime primary `oklch(0.53 0.16 131)` on pure white `oklch(1 0 0)` | Warm earth-tone primary `oklch(0.45 0.1 155)` on warm off-white `oklch(0.965 0.008 75)`. Full dark-mode overhaul with different hue/chroma. |
| **Motion** | No easing tokens | `--ease-spring` (playful overshoot), `--ease-smooth` (pro entrance), `--ease-snap` (snappy response) + duration tokens (`--duration-fast` 150ms through `--duration-slower` 500ms) |
| **Dialogs / drawers** | 2 files (settings-dialog, ui/dialog) | **Bottom-sheet drawers** (Vaul) as the default for task workflows: announcement editor, service-plan-item editor, broadcast settings, template manager, notes selection, paste lyrics, export notes, distribute summary, song detail, online song preview. Centered Dialog reserved for confirms (end session, delete), launchers (welcome, about, resume), and quick-jumps (song-jump Cmd+G, projector picker). |
| **Settings** | Same 7 section names, ~800 lines, modal | 8 sections (Audio, Speech, Bible, Display, Hymnals, Remote, API Keys, Help) rendered as a **full-screen overlay** with sidebar nav. AssemblyAI key moved to API Keys for consistency with DeepSeek/Pexels/etc. |
| **Keyboard** | None | Command palette (cmdk) + native app menu with keyboard shortcuts bridged to in-app actions |
| **Broadcast monitor** | Not present | Operator preview component that mirrors the broadcast window inside the app, plus an `AnnouncementControl` chip header with Pause/Resume/Dismiss + countdown |
| **Themes** | 3 built-in themes (~238 lines) | Expanded theme library (~562 lines) with theme-library browser panel |
| **Toasts** | None | `sonner` for non-blocking feedback (verify results, AI generation status, etc.) |

---

## Inherited from upstream rhema

The **architecture** of these subsystems is rhema's. Some Manna left as-is; many Manna tuned, extended, or fixed. Annotations call out where Manna touched.

- Real-time speech-to-text via **Deepgram Nova-3** (WebSocket streaming) — *Manna refactored: ws_runtime now shared with AssemblyAI, split reconnect/disconnect semantics*
- Local **Whisper** STT (`ggml-large-v3-turbo`) as an offline option — *as-is*
- Multi-strategy verse detection pipeline — *core architecture rhema's; Manna tuned thresholds, prioritized Qwen3 over MiniLM (2082a19), added FP16 ONNX support (afc0671), fixed `parse_tens` spoken-number bug (272bffe), smarter semantic filter (308b4eb), voice navigation (ad35adc)*:
  - Direct reference parsing (Aho-Corasick + fuzzy matching)
  - Semantic search (Qwen3-0.6B ONNX embeddings + HNSW vector index)
  - Quotation matching against verse text
  - Cloud booster (semantic re-rank)
  - Sermon context tracking + sentence buffering
  - Reading-mode classifier (reading vs. referencing) — *Manna rewrote (~1062 → ~797 lines)*
- SQLite Bible database (FTS5) — *as-is*
- Multiple translations: KJV, NIV, ESV, NASB, NKJV, NLT + ES / FR / PT — *Manna added **AMP** (Amplified) seeding (fb1d885)*
- Cross-reference lookup (340k+ refs, openbible.info) — *Manna fixed integer-column query bug (4517b97)*
- **NDI broadcast output** for live production — *as-is, minor event-naming change (c81160f)*
- **Theme designer** — canvas editor schema (backgrounds, text styling, positioning, shadows, outlines) is rhema's; *Manna **revamped the UI** ("modern, compact, Figma-inspired" — a050850)*
- Audio capture (cpal stream), level metering, live indicator, session timer — *Manna added per-session audio recording (3f44c93) + standalone audio test panel (c57e157) + input-gain control on top*
- Data pipeline (download translations, build SQLite DB, export ONNX model, precompute embeddings) — *Manna added phase-subset orchestrator + GPU pre-flight (c84f11b), EasyWorship 6 import (99af9e3), multi-hymnal seeding*
- Tauri v2 desktop app, React 19 frontend, Rust workspace backend — *as-is*

---

## Manna additions

### Speech-to-text

| Feature | File(s) |
|---|---|
| **AssemblyAI Universal-Streaming v3 provider** (word-level confidence, keyterm prompting) | `src-tauri/crates/stt/src/assemblyai.rs` |
| **Shared WebSocket runtime** — Deepgram + AssemblyAI share one connect / reconnect / audio-drop loop | `src-tauri/crates/stt/src/ws_runtime.rs` |
| **`TranscriptEvent::Reconnecting`** + `stt_reconnecting` Tauri event — transient drops no longer tear down the UI | `stt/src/types.rs`, `commands/stt.rs` |
| **API-key verifier commands** — HTTP auth probe + WebSocket handshake for STT providers; HTTP probe for DeepSeek | `commands/stt.rs` (`verify_deepgram_key`, `verify_assemblyai_key`, `verify_deepseek_key`) |
| **Test buttons** in Settings → API Keys with inline ✓ / ✗ + detail | `components/settings-dialog.tsx` |
| AssemblyAI keyterms module expanded | `stt/src/keyterms.rs` |

### Sermon workflow

| Feature | File(s) |
|---|---|
| **Persistent sessions** — transcript, detections, notes saved per service in a separate SQLite layer | `src-tauri/crates/notes/src/db.rs`, `commands/session.rs`, `types/session.ts` |
| **Sessions-first landing screen** — fresh launch shows the sessions list and "Start a new session" form, not the workspace | `components/layout/sessions-landing.tsx` |
| **Sessions Mode overlay** — full-screen takeover w/ list + per-session detail. Home icon in toolbar opens it. | `components/layout/sessions-landing.tsx`, `stores/session-store.ts` (`sessionsMode`, `sessionsView`) |
| **Auto-preflight from landing** — submit creates session in `planned` status, preflight opens; "Start Service" in preflight stamps `startedAt` (timer starts there) + kicks off transcription | `lib/start-service.ts`, `stores/session-store.ts` (`pendingServiceStart`), `components/layout/toolbar.tsx` |
| **Pre-flight checklist** — mic / API key (per provider) / network | `components/preflight-checklist.tsx` |
| **Session detail**, **resume session dialog**, **end session dialog** | `components/panels/session-detail.tsx`, `components/session/*` |
| **Session card stats** — duration, detections, presented count, summary badge w/ top key verse | `components/layout/sessions-landing.tsx` |
| **Session detail tabs** — Summary first, then Transcript, Detections, Stats | `components/panels/session-detail.tsx` |
| **"No verses went live" bug fix** — `setLiveVerse` now records presented detections via `record_presented_verse` (UPDATE existing or INSERT manual row, mutually exclusive with image/notes/blank) | `stores/broadcast-store.ts`, `commands/session.rs`, `crates/notes/src/db.rs` |
| **History panel** — 99%+ confidence verses auto-added | `components/panels/history-panel.tsx` |
| **Analytics panel** — per-session + aggregate stats | `components/panels/analytics-panel.tsx`, `commands/analytics.rs` |
| **Cross-reference panel** — live lookup alongside the broadcast verse | `components/panels/crossref-panel.tsx` |
| **Session export drawer** — clipboard, markdown, JSON, print | `components/session/export-notes-drawer.tsx`, `lib/export-notes-drawer.ts` |
| **AI sermon summary** via **DeepSeek** (`deepseek-chat` w/ `deepseek-reasoner` fallback, JSON `response_format`); structured shape (topic, key verses, main points, takeaways, quotes) persisted to `sermon_sessions.summary_json` and rendered as Summary tab cards | `src-tauri/src/commands/summarize.rs`, `lib/summarize.ts`, `components/panels/session-detail.tsx` |
| **Distribute summary drawer** | `components/session/distribute-summary-drawer.tsx` |

### Service Plan

| Feature | File(s) |
|---|---|
| **Service Plan panel** — drag-reorderable items, pinned in the right column under the tabs | `components/panels/service-plan-panel.tsx`, `service-plan-item.tsx`, `service-plan-item-editor.tsx` |
| **Plan-item kinds** — `verse`, `song`, `announcement`, `notes`, `blank` (logo or custom image), `momo`, `jesus`, `section` | `types/index.ts` (`PlanItemPayload`), `crates/notes/src/plan_models.rs` |
| **Activation router** — ▶ on each kind routes to the right primitive (verse → `setLiveVerse`, image → `setFullscreenImage`, announcement → edit drawer, notes → selection drawer, etc.) | `components/service-plan/activation-router.ts` |
| **Templates** — save current plan as a reusable template; load into session | `components/service-plan/template-manager.tsx`, `commands/service_plan.rs` |
| **Plan persistence** — `service_plan_items` table (CHECK constraint widens on schema change via auto-rebuild) | `crates/notes/src/db.rs`, `plan_db.rs` |
| **Plan-item editor** (Vaul drawer) — edit blank slide image, section label, etc. | `components/panels/service-plan-item-editor.tsx` |

### Notes (manual + AI)

| Feature | File(s) |
|---|---|
| **Notes panel** w/ inline markdown bold/italic rendering | `components/panels/notes-panel.tsx`, `lib/markdown-inline.tsx` (React tree, no `innerHTML`) |
| **"Generate points" button** — operator-triggered, calls DeepSeek with transcript-so-far + existing AI bullets; prompt enforces first-person operator-note voice (no reported speech) | `lib/ai-notes-scheduler.ts`, `src-tauri/src/commands/summarize.rs` (`generate_live_notes`) |
| **AI note rows** distinguished with sparkle icon + amber tint in both NotesPanel and the Notes selection drawer | `components/panels/notes-panel.tsx`, `components/notes/notes-selection-drawer.tsx` |
| **Notes plan-item kind** — operator inserts a "Notes" item into Service Plan; ▶ opens drawer w/ title input + oldest-first note list (click-ordered ordinals), live preview, **Go Live** or **Update slide** (replaces Go Live when this item is already on screen) | `components/notes/notes-selection-drawer.tsx`, `lib/notes-selection-drawer.ts` |
| **Inline add + edit** of notes from inside the selection drawer (via `add_session_note` / `update_session_note`); live slide refreshes when an active bullet's text is edited | `components/notes/notes-selection-drawer.tsx`, `commands/session.rs` (`update_session_note`) |
| **Canvas notes renderer** — numbered chips (accent-filled, contrast-aware digit), title with underline accent rule, word-wrapped bullets, default "Sermon Notes" title fallback | `lib/notes-renderer.ts`, `broadcast-output.tsx` |

### Projection pipeline

| Feature | File(s) |
|---|---|
| **Image search → live projection** — Pexels + Unsplash + Brave Search Image providers; `presentImageLive` pipes selection to `setFullscreenImage` | `components/panels/images-panel.tsx`, `stores/broadcast-store.ts`, `commands/images.rs` |
| **Default-to-blank projector boot** — EWC logo screen on session start, no black void | `stores/broadcast-store.ts` (`setBlankLogo`), `broadcast-output.tsx` |
| **Projector picker** w/ proportional monitor arrangement view, polls for new monitors | `components/broadcast/projector-picker-dialog.tsx`, `lib/projector-picker.ts`, `commands/monitors.rs` |
| **Custom image upload on blank slides** — file picker → embedded image URL | `components/panels/service-plan-item-editor.tsx`, blank plan-item payload |
| **Announcement runtime** — ticker (RAF marquee bottom band, current slide stays) or full slide; Pause/Resume/Dismiss + countdown chip on broadcast monitor header and inline on the active plan-item card | `stores/broadcast-store.ts` (`announcement` slot w/ `expiresAt`/`remainingMs`/`paused`), `broadcast-output.tsx`, `components/broadcast/broadcast-monitor.tsx`, `components/panels/service-plan-item.tsx` (`AnnouncementLiveRow`) |
| **Bible picker grids** in Search panel — Books (OT/NT) → Chapters → existing verse list; breadcrumb back-nav. Popover combobox kept. | `components/panels/search-panel.tsx`, `lib/bible-chapters.ts` |

### Songs + hymnals

| Feature | File(s) |
|---|---|
| **Songs panel** — local + online (Genius, LRClib) song search w/ stanza presentation | `components/panels/songs-panel.tsx`, `commands/songs.rs` |
| **Song detail drawer** + **paste lyrics drawer** + **online preview drawer** + **song-jump dialog** (Cmd+G) | `components/songs/*` |
| **Multi-hymnal seeding** — runtime-toggleable hymnal sources (Settings → Hymnals); idempotent seed via `seed_version` | `src-tauri/src/lib.rs` (`seed_hymnals`), `commands/hymnals.rs`, `src/types/song.ts` |
| **LineMode rendering** — `"line"` / `"stanza-pair"` / `"stanza-full"` lyric layout, fixes the runs-on bug for EasyWorship imports | `lib/song-expand.ts`, `types/song.ts` |
| **Lyrics search** — MiniSearch index includes full lyric body, cached by songs ref | `lib/song-search.ts` |

### App shell

| Feature | File(s) |
|---|---|
| **Command palette** (cmdk) — jump to any action, panel, setting | `components/command-palette.tsx`, `lib/command-registry.ts` |
| **Native app menu** + hook bridging menu items to in-app actions | `src-tauri/src/menu.rs`, `hooks/use-menu-events.ts` |
| **Workspace / tabbed panels / toolbar** layout refactor | `components/layout/workspace.tsx`, `panel-tabs.tsx`, `toolbar.tsx` |
| **Welcome dialog**, **About dialog** | `components/{welcome,about}-dialog.tsx` |
| **Settings as full-screen overlay** w/ sidebar nav — replaces the modal | `components/settings-dialog.tsx` |
| **Vaul drawers** as the default for task workflows (announcement, plan-item edit, broadcast settings, template manager, notes selection, paste lyrics, export, distribute) | `components/ui/drawer.tsx` + consumers |
| **Theme library** with curated built-in broadcast themes (~324 lines of presets) | `lib/builtin-themes.ts`, `components/broadcast/theme-library.tsx` |
| **Broadcast monitor** operator preview | `components/broadcast/broadcast-monitor.tsx` |
| **Themes command table** — save / list / delete custom themes | `commands/themes.rs` |
| **Sonner toaster** mounted at app root | `App.tsx` |
| **Keepawake** — laptop won't sleep while Manna is open, dropped on quit | `keepawake` crate, `src-tauri/src/lib.rs` |

### Infra / reliability

| Feature | File(s) |
|---|---|
| **Connection warmup** at startup — HEAD probes for Deepgram, AssemblyAI, DeepSeek hosts to pre-warm reqwest TLS pool so the first verify/summary call doesn't pay the cold-TLS penalty | `src-tauri/src/lib.rs` (`warm_connection_pool`) |
| **AI/LLM migration to DeepSeek** — `summarize_sermon` rewritten OpenAI-compatible, `response_format: json_object`, models fall back `deepseek-chat` → `deepseek-reasoner`. Anthropic Claude removed. | `src-tauri/src/commands/summarize.rs`, `stores/settings-store.ts` (`deepseekApiKey` + `persistDeepseekApiKey`) |
| **`verify_deepseek_key`** Rust command + Settings UI Test button | `commands/stt.rs`, `components/settings-dialog.tsx` |

### Detection

Manna rewrote parts of reading-mode (upstream's is ~1,062 lines; Manna's is ~797 lines — different approach, smaller surface). Includes spoken-number parsing (`parse_tens` + units), not present upstream.

### Branding + tooling

- Package renamed `rhema` → `manna`, bundle ID `com.manna.app`
- `docs/superpowers/{specs,plans}/` — design specs and implementation plans for Manna features
- `docs/LEARNINGS.md`, `docs/EXECUTION.md`

---

## Manna changes (behaviour different from upstream)

- **Default STT provider:** Manna defaults to `deepgram`; AssemblyAI is opt-in
- **Disconnect semantics:** upstream emits `stt_disconnected` on every Deepgram close (including silence-timeout auto-reconnects). Manna splits this — `stt_reconnecting` for transient drops, `stt_disconnected` only when terminal. UI keeps `isTranscribing = true` across reconnects.
- **Settings hydration:** parallelized via `Promise.all` for the now-larger set of persisted keys (Deepgram, AssemblyAI, DeepSeek, Pexels, Unsplash, Brave, Genius, …)
- **Session lifecycle:** sessions are created in `planned` status from the landing screen and only promoted to `live` (which stamps `startedAt`) when the operator confirms the preflight checklist. The elapsed timer starts there, not at session-create.
- **Mutually-exclusive screen states:** `liveVerse`, `fullscreenImage`, `liveNotes`, `blankLogo` are all cleared by any other setter — the projector renders exactly one mode at a time. `setLiveVerse` also calls `record_presented_verse` so the session detail's "verses shown on screen" count is correct.
- **Auto-broadcast cooldown:** moved from module-level `let` to `useRef`, so multiple `TranscriptPanel` mounts don't share state
- **Broadcast history:** centralised into a `broadcast-store.addToHistory` action with dedup + 50-item cap; callers delegate instead of mutating directly
- **Cross-store coupling:** `broadcast-store` reads `useSessionStore` to short-circuit `record_presented_verse` when no live session exists; no observed cycle.

---

## What Manna removed

- Upstream's Vitest suites for `use-transcription`, `quick-search`, `bible-store`, `settings-store` (replaced incrementally as features were rewritten; not yet re-added — **TODO**)
- `src/lib/quick-search.ts` (functionality folded into the planner + command palette)
- `documentation/remote-control.md` (superseded by the settings-dialog Remote section)
- **Anthropic Claude integration** — migrated to DeepSeek (OpenAI-compatible). `persistClaudeApiKey` is still in the store as a no-op shim; `claudeApiKey` field is no longer used by any command.
- **Slide-change transitions runtime** — schema field still exists on `BroadcastTheme.transition` (`type`/`duration`/`easing`/`direction`) but `broadcast-output.tsx` ignores it; all changes paint instantly. User preferred instant cuts during live operation. Re-add if needed.
- **AI auto-tick scheduler for live notes** — was originally a 10-min interval; replaced with a manual "Generate points" button per user preference.

---

## Credit

rhema built the foundational architecture: the audio-capture loop, the multi-strategy detection ensemble, the ONNX embedding pipeline, the NDI FFI, the theme schema + canvas renderer engine, the Bible data pipeline, and the original Tauri + React + Rust workspace shape. That is meaningful, hard work that Manna would not exist without — please star [openbezal/rhema](https://github.com/openbezal/rhema).

What Manna did on top: tuned detection thresholds + prioritized Qwen3; added FP16 ONNX, AMP translation, multi-hymnal seeding, EasyWorship 6 import, phase-subset setup orchestrator; refactored STT into a shared WebSocket runtime (Deepgram + AssemblyAI) with split reconnect/disconnect semantics; revamped the theme designer UI; rebuilt the workspace shell (resizable panels, sessions-first landing, full-screen settings, drawer-first dialogs, command palette, native menu); added the entire church-livestream workflow (persistent sessions, service plan, notes panel + AI notes via DeepSeek, projection pipeline w/ image search, announcement runtime, projector picker); and migrated AI summaries from Anthropic Claude to DeepSeek. Honest framing: rhema is the engine; Manna is a deep workflow + reliability fork on top.
