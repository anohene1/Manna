# Top English Translation Embeddings Design

**Date:** 2026-06-03
**Project:** Manna
**Status:** Proposed

## Goal

Improve semantic verse detection for modern English Bible wording by precomputing Qwen3 embeddings for the practical top translation set: KJV, NKJV, NIV, ESV, and NLT.

This is an accuracy/recall improvement, not a speed optimization. The app should keep KJV as the reliable fallback and avoid loading every translation index into memory at startup.

## Current State

The embedding pipeline is KJV-centered:

- `data/compute-embeddings.ts` exports only KJV verses into `data/verses-for-embedding.json`.
- `package.json` runs the Rust precompute binary against that one JSON file.
- Startup in `src-tauri/src/lib.rs` resolves only KJV embedding/id files:
  - `embeddings/kjv-qwen3-0.6b.bin`
  - `embeddings/kjv-qwen3-0.6b-ids.bin`
- Semantic detection uses the loaded vector index and returns verse ids from that index.
- User-facing rendering already maps references/text through the active Bible translation in several places, but semantic search itself is matching against KJV wording.

There is a rough `data/precompute-all-translations.py`, but it is not integrated into setup scripts and uses confusing KJV-prefixed filenames for non-KJV outputs.

## Translation Set

Support these abbreviations in v1:

- `KJV`
- `NKJV`
- `NIV`
- `ESV`
- `NLT`

If one of these translations is not present in `data/rhema.db`, the tooling should skip it with a clear warning rather than failing the whole run.

## Proposed File Naming

Use abbreviation-first filenames so the runtime can resolve files directly:

```text
embeddings/kjv-qwen3-0.6b.bin
embeddings/kjv-qwen3-0.6b-ids.bin
embeddings/nkjv-qwen3-0.6b.bin
embeddings/nkjv-qwen3-0.6b-ids.bin
embeddings/niv-qwen3-0.6b.bin
embeddings/niv-qwen3-0.6b-ids.bin
embeddings/esv-qwen3-0.6b.bin
embeddings/esv-qwen3-0.6b-ids.bin
embeddings/nlt-qwen3-0.6b.bin
embeddings/nlt-qwen3-0.6b-ids.bin
```

Keep the existing KJV filenames to avoid breaking the current setup.

## Tooling Design

Replace the KJV-only export path with a translation-aware export/precompute workflow.

### Export

Add a script or update `data/compute-embeddings.ts` to accept:

```bash
bun run data/compute-embeddings.ts --translations=KJV,NKJV,NIV,ESV,NLT
```

For each requested translation:

- Look up translation id by abbreviation.
- Export rows ordered by verse id:
  - `id`
  - `text`
  - `ref`
  - `translation`
- Write to:
  - `data/verses-for-embedding-kjv.json`
  - `data/verses-for-embedding-nkjv.json`
  - `data/verses-for-embedding-niv.json`
  - `data/verses-for-embedding-esv.json`
  - `data/verses-for-embedding-nlt.json`

For backward compatibility, KJV export may also refresh `data/verses-for-embedding.json`.

### Precompute

Update setup/precompute orchestration so `setup:semantic` can generate the top-set files.

Preferred behavior:

- Loop over the requested translations.
- Skip an embedding pair when both output files already exist unless `--force` is passed.
- Run the existing Rust precompute binary once per translation JSON.
- Write the matching abbreviation-prefixed output files.

The old single-translation command can stay for direct KJV-only use, but the setup path should use the top-set loop.

## Runtime Design

The runtime should not load all five indexes at startup.

Instead:

1. Load the best available Qwen3 model once, as it does today.
2. Load the KJV index at startup as the baseline fallback.
3. Track which translation abbreviation each semantic index belongs to.
4. When active translation changes to NKJV/NIV/ESV/NLT:
   - If the matching embedding/id files exist, load that index lazily.
   - If loading succeeds, semantic search uses that active index.
   - If missing or load fails, log a warning and keep using KJV.
5. If the active translation is outside the top set, keep using KJV.

This keeps memory bounded and avoids multi-index startup cost.

## Detection Behavior

Semantic detection should search against the active semantic index. The returned ids should already belong to that translation's verse rows. For fallback KJV search, existing behavior remains valid: the app can still map the detected reference into the active translation for display.

Important nuance:

- If searching an active translation index, ids point to that translation's verses.
- If falling back to KJV, ids point to KJV verses.
- Detection display should continue to prefer reference mapping over raw verse text when presenting active-translation output.

## Error Handling

- Missing translation in DB: skip during export/precompute with warning.
- Missing embedding files at runtime: use KJV fallback.
- Failed index load: log the translation abbreviation and error, then use KJV fallback.
- Missing KJV baseline: semantic detection remains unavailable, matching current failure mode.

## Testing

Add focused tests for:

- Translation abbreviation normalization and filename generation.
- Export selection for requested top-set translations.
- Runtime fallback decision: active translation index exists vs missing.
- Existing KJV-only path remains valid.

Manual verification:

- Generate KJV + one non-KJV index first, preferably NIV.
- Start app and confirm logs show KJV baseline loaded.
- Switch active translation to NIV and confirm semantic index switches/lazy-loads.
- Switch active translation to a translation without embeddings and confirm KJV fallback.
- Run semantic search with modern NIV-like wording and compare results against KJV-only behavior.

## Scope Boundaries

This change should not:

- Change the embedding model family.
- Add cloud embeddings.
- Precompute every bundled translation.
- Load all translation indexes into memory at startup.
- Retune semantic thresholds yet.

Threshold retuning can be done after real sermon data shows whether the extra translation indexes change false-positive or false-negative behavior.
