import { invoke } from "@tauri-apps/api/core"
import { useBibleStore } from "@/stores/bible-store"
import { retranslateBroadcastVerses } from "@/hooks/use-broadcast"

let inFlight: Promise<void> | null = null
let pendingId: number | null = null

/**
 * Switch active Bible translation without blocking the UI.
 *
 * - Updates zustand immediately so pickers reflect the new selection.
 * - Persists to Rust settings + re-translates broadcast verses in the
 *   background.
 * - Coalesces rapid switches: only the latest target id is honored.
 */
export function switchTranslation(id: number): void {
  const state = useBibleStore.getState()
  if (state.activeTranslationId === id && inFlight == null) return

  state.setActiveTranslation(id)
  pendingId = id

  if (inFlight) return

  inFlight = (async () => {
    while (pendingId != null) {
      const target = pendingId
      pendingId = null
      try {
        const abbr =
          useBibleStore.getState().translations.find((t) => t.id === target)?.abbreviation ?? ""
        await invoke("set_active_translation", { translationId: target })
        await retranslateBroadcastVerses(target, abbr)
      } catch (err) {
        console.error("[switch-translation]", err)
      }
    }
  })().finally(() => {
    inFlight = null
  })
}
