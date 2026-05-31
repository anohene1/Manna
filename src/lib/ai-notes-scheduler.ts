import { invoke } from "@tauri-apps/api/core"
import {
  useSessionStore,
  useSettingsStore,
  useTranscriptStore,
} from "@/stores"
import type { SessionNote } from "@/types"

/** Join all final transcript segments into a single string. */
function fullTranscript(): string {
  const segments = useTranscriptStore.getState().segments
  return segments
    .filter((s) => s.is_final)
    .map((s) => s.text)
    .join(" ")
    .trim()
}

let inFlight: Promise<number> | null = null

/** Generate 1-2 NEW AI bullets from transcript-so-far and persist them as
 *  session notes (noteType="ai"). Triggered manually by the "Generate points"
 *  button. Throws with a user-readable message on failure. */
export async function generateLiveNotesNow(): Promise<number> {
  // Coalesce concurrent calls (double-click / rapid trigger). Without this
  // both flights race past the existing-bullets snapshot and write duplicates.
  if (inFlight) return inFlight
  inFlight = runGenerationLocked().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runGenerationLocked(): Promise<number> {
  const session = useSessionStore.getState().activeSession
  if (!session || session.status !== "live") {
    throw new Error("No active live session.")
  }
  if (!useTranscriptStore.getState().isTranscribing) {
    throw new Error("Not transcribing — start the service first.")
  }

  const transcript = fullTranscript()
  if (transcript.trim().length === 0) {
    throw new Error("Transcript is empty.")
  }

  const apiKey = useSettingsStore.getState().deepseekApiKey ?? ""
  if (!apiKey.trim()) {
    throw new Error("DeepSeek API key not set in Settings.")
  }

  let existingBullets: string[] = []
  try {
    const notes = await invoke<SessionNote[]>("get_session_notes", {
      sessionId: session.id,
    })
    existingBullets = notes
      .filter((n) => n.noteType === "ai")
      .map((n) => n.content)
  } catch (e) {
    console.warn("[ai-notes] read existing failed", e)
  }

  console.info(
    `[ai-notes] generating — transcript ${transcript.length} chars, ` +
      `${existingBullets.length} existing AI bullet(s)`,
    { existingBullets },
  )

  const bullets = await invoke<string[]>("generate_live_notes", {
    apiKey,
    transcript,
    existingBullets,
  })
  console.info(
    `[ai-notes] DeepSeek returned ${bullets.length} bullet(s) after dedup:`,
    bullets,
  )
  for (const b of bullets) {
    await invoke("add_session_note", {
      request: { sessionId: session.id, noteType: "ai", content: b },
    })
  }
  return bullets.length
}

/** Quick stats for the toast — exposed so NotesPanel can show "transcript Nk / existing M" while generating. */
export function describeGenerationContext(): string {
  const session = useSessionStore.getState().activeSession
  if (!session) return ""
  const chars = fullTranscript().length
  return `${(chars / 1000).toFixed(1)}k chars transcript`
}
