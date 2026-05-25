import { invoke } from "@tauri-apps/api/core"
import { useSettingsStore } from "@/stores"
import type { SessionDetection, SessionTranscriptSegment } from "@/types/session"

export interface SermonQuote {
  text: string
  /** Optional speaker attribution; usually the preacher's name when known. */
  speaker?: string
}

export interface SermonSummary {
  topic: string
  key_verses: string[]
  main_points: string[]
  takeaways: string[]
  quotes: SermonQuote[]
}

/**
 * Fetch transcript + presented verses for a session, run summarization,
 * persist result to the session row. Best-effort; logs and swallows errors
 * so a missing API key or empty transcript doesn't break session-end flow.
 */
export async function generateAndPersistSummary(sessionId: number): Promise<SermonSummary | null> {
  try {
    const [transcript, detections] = await Promise.all([
      invoke<SessionTranscriptSegment[]>("get_session_transcript", { sessionId }),
      invoke<SessionDetection[]>("get_session_detections", { sessionId }),
    ])
    const text = transcript.map((s) => s.text).join(" ").trim()
    if (!text) return null
    const presented = detections.filter((d) => d.wasPresented).map((d) => d.verseRef)
    const summary = await summarizeTranscript(text, presented)
    await invoke("update_session_summary", {
      id: sessionId,
      summary: summaryToJson(summary),
    })
    return summary
  } catch (e) {
    console.warn("[auto-summary] failed:", e)
    return null
  }
}

export async function summarizeTranscript(
  transcript: string,
  presentedVerses?: string[],
): Promise<SermonSummary> {
  const apiKey = useSettingsStore.getState().deepseekApiKey
  if (!apiKey) {
    throw new Error("DeepSeek API key not configured. Add it in Settings → API Keys.")
  }
  const raw = await invoke<string>("summarize_sermon", {
    apiKey,
    transcript,
    presentedVerses,
  })
  return parseSummary(raw)
}

export function parseSummary(raw: string): SermonSummary {
  const cleaned = stripCodeFence(raw).trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end === -1) {
    throw new Error("Summary response was not JSON. Raw: " + raw.slice(0, 200))
  }
  const json = cleaned.slice(start, end + 1)
  const parsed = JSON.parse(json) as Partial<SermonSummary>
  const rawQuotes = Array.isArray(parsed.quotes) ? parsed.quotes : []
  const quotes: SermonQuote[] = rawQuotes
    .map((q) => {
      if (typeof q === "string") return { text: q.trim() }
      if (q && typeof q === "object") {
        const text = String((q as { text?: unknown }).text ?? "").trim()
        const speaker = (q as { speaker?: unknown }).speaker
        return text
          ? { text, ...(typeof speaker === "string" && speaker.trim() ? { speaker: speaker.trim() } : {}) }
          : null
      }
      return null
    })
    .filter((q): q is SermonQuote => q !== null)
    .slice(0, 5)
  return {
    topic: String(parsed.topic ?? "").trim() || "Sermon",
    key_verses: Array.isArray(parsed.key_verses) ? parsed.key_verses.map(String) : [],
    main_points: Array.isArray(parsed.main_points) ? parsed.main_points.map(String) : [],
    takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways.map(String).slice(0, 5) : [],
    quotes,
  }
}

function stripCodeFence(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "")
}

export function summaryToJson(s: SermonSummary): string {
  return JSON.stringify(s)
}

export function summaryFromJson(s: string | null | undefined): SermonSummary | null {
  if (!s) return null
  try {
    return parseSummary(s)
  } catch {
    return null
  }
}
