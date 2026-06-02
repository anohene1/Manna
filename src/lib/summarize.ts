import { invoke } from "@tauri-apps/api/core"
import { useSettingsStore } from "@/stores"
import type {
  SessionDetection,
  SessionTranscriptSegment,
} from "@/types/session"

export interface SermonQuote {
  text: string
  /** Optional speaker attribution; usually the preacher's name when known. */
  speaker?: string
}

export interface SermonKeyVerse {
  reference: string
  reason: string
}

export interface SermonFlowPoint {
  point: string
  explanation: string
  scripture_refs: string[]
  illustration_or_moment: string
  application: string
}

export interface SermonFlow {
  opening: string
  main_points: SermonFlowPoint[]
  conclusion: string
  response: string
}

export interface SermonDevotional {
  scripture: string
  observation: string
  application: string
  prayer: string
  reflection_questions: string[]
}

export interface SermonSummary {
  title: string
  big_idea: string
  key_verses: SermonKeyVerse[]
  sermon_flow: SermonFlow
  devotional: SermonDevotional
  takeaways: string[]
  quotes: SermonQuote[]
  /** @deprecated Compatibility for older UI code. Prefer title. */
  topic: string
  /** @deprecated Compatibility for older UI code. Prefer sermon_flow.main_points. */
  main_points: string[]
}

/**
 * Fetch transcript + presented verses for a session, run summarization,
 * persist result to the session row. Best-effort; logs and swallows errors
 * so a missing API key or empty transcript doesn't break session-end flow.
 */
export async function generateAndPersistSummary(
  sessionId: number
): Promise<SermonSummary | null> {
  try {
    const [transcript, detections] = await Promise.all([
      invoke<SessionTranscriptSegment[]>("get_session_transcript", {
        sessionId,
      }),
      invoke<SessionDetection[]>("get_session_detections", { sessionId }),
    ])
    const text = transcript
      .map((s) => s.text)
      .join(" ")
      .trim()
    if (!text) return null
    const presented = detections
      .filter((d) => d.wasPresented)
      .map((d) => d.verseRef)
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
  presentedVerses?: string[]
): Promise<SermonSummary> {
  const apiKey = useSettingsStore.getState().deepseekApiKey
  if (!apiKey) {
    throw new Error(
      "DeepSeek API key not configured. Add it in Settings → API Keys."
    )
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
  const parsed = JSON.parse(json) as Record<string, unknown>
  return withLegacyAccessors({
    title: cleanString(parsed.title) || cleanString(parsed.topic),
    big_idea: cleanString(parsed.big_idea) || cleanString(parsed.topic),
    key_verses: normalizeKeyVerses(parsed.key_verses),
    sermon_flow: normalizeSermonFlow(parsed.sermon_flow, parsed.main_points),
    devotional: normalizeDevotional(parsed.devotional),
    takeaways: normalizeStringArray(parsed.takeaways).slice(0, 5),
    quotes: normalizeQuotes(parsed.quotes).slice(0, 5),
  })
}

function stripCodeFence(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "")
}

export function summaryToJson(s: SermonSummary): string {
  return JSON.stringify(s)
}

export function summaryFromJson(
  s: string | null | undefined
): SermonSummary | null {
  if (!s) return null
  try {
    return parseSummary(s)
  } catch {
    return null
  }
}

export function formatSummaryAsMarkdown(summary: SermonSummary): string {
  const lines: string[] = []

  lines.push(`# ${summary.title}`, "")

  if (summary.big_idea) {
    lines.push("## Big Idea", summary.big_idea, "")
  }

  if (summary.key_verses.length > 0) {
    lines.push("## Key Verses")
    for (const verse of summary.key_verses) {
      const reason = verse.reason ? ` - ${verse.reason}` : ""
      lines.push(`- ${verse.reference}${reason}`)
    }
    lines.push("")
  }

  lines.push("## Sermon Flow")
  if (summary.sermon_flow.opening) {
    lines.push(`Opening: ${summary.sermon_flow.opening}`)
  }
  for (const point of summary.sermon_flow.main_points) {
    lines.push(`- ${point.point}`)
    if (point.explanation) lines.push(`  ${point.explanation}`)
    if (point.scripture_refs.length > 0)
      lines.push(`  Scriptures: ${point.scripture_refs.join(", ")}`)
    if (point.illustration_or_moment)
      lines.push(`  Moment: ${point.illustration_or_moment}`)
    if (point.application) lines.push(`  Application: ${point.application}`)
  }
  if (summary.sermon_flow.conclusion) {
    lines.push(`Conclusion: ${summary.sermon_flow.conclusion}`)
  }
  if (summary.sermon_flow.response) {
    lines.push(`Response: ${summary.sermon_flow.response}`)
  }
  lines.push("")

  lines.push("### Devotional Follow-up")
  if (summary.devotional.scripture)
    lines.push(`Scripture: ${summary.devotional.scripture}`)
  if (summary.devotional.observation)
    lines.push(`Observation: ${summary.devotional.observation}`)
  if (summary.devotional.application)
    lines.push(`Application: ${summary.devotional.application}`)
  if (summary.devotional.prayer)
    lines.push(`Prayer: ${summary.devotional.prayer}`)
  if (summary.devotional.reflection_questions.length > 0) {
    lines.push("Reflection Questions:")
    for (const question of summary.devotional.reflection_questions) {
      lines.push(`- ${question}`)
    }
  }
  lines.push("")

  if (summary.takeaways.length > 0) {
    lines.push(
      "## Takeaways",
      ...summary.takeaways.map((takeaway) => `- ${takeaway}`),
      ""
    )
  }

  if (summary.quotes.length > 0) {
    lines.push("## Quotes")
    for (const quote of summary.quotes) {
      lines.push(`> ${quote.text}`)
      if (quote.speaker) lines.push(`- ${quote.speaker}`)
      lines.push("")
    }
  }

  return lines.join("\n").trim()
}

type RichSummary = Omit<SermonSummary, "topic" | "main_points">

function normalizeKeyVerses(value: unknown): SermonKeyVerse[] {
  if (!Array.isArray(value)) return []
  return value
    .map((verse) => {
      if (typeof verse === "string") {
        const reference = verse.trim()
        return reference ? { reference, reason: "" } : null
      }
      if (!isRecord(verse)) return null
      const reference = cleanString(verse.reference)
      if (!reference) return null
      return {
        reference,
        reason: cleanString(verse.reason),
      }
    })
    .filter((verse): verse is SermonKeyVerse => verse !== null)
}

function normalizeSermonFlow(
  value: unknown,
  legacyMainPoints: unknown
): SermonFlow {
  const flow = isRecord(value) ? value : {}
  return {
    opening: cleanString(flow.opening),
    main_points: normalizeFlowPoints(flow.main_points ?? legacyMainPoints),
    conclusion: cleanString(flow.conclusion),
    response: cleanString(flow.response),
  }
}

function normalizeFlowPoints(value: unknown): SermonFlowPoint[] {
  if (!Array.isArray(value)) return []
  return value
    .map((point) => {
      if (typeof point === "string") {
        const text = point.trim()
        return text ? emptyFlowPoint(text) : null
      }
      if (!isRecord(point)) return null
      const text = cleanString(point.point)
      if (!text) return null
      return {
        point: text,
        explanation: cleanString(point.explanation),
        scripture_refs: normalizeStringArray(point.scripture_refs),
        illustration_or_moment: cleanString(point.illustration_or_moment),
        application: cleanString(point.application),
      }
    })
    .filter((point): point is SermonFlowPoint => point !== null)
}

function normalizeDevotional(value: unknown): SermonDevotional {
  const devotional = isRecord(value) ? value : {}
  return {
    scripture: cleanString(devotional.scripture),
    observation: cleanString(devotional.observation),
    application: cleanString(devotional.application),
    prayer: cleanString(devotional.prayer),
    reflection_questions: normalizeStringArray(devotional.reflection_questions),
  }
}

function normalizeQuotes(value: unknown): SermonQuote[] {
  if (!Array.isArray(value)) return []
  return value
    .map((quote): SermonQuote | null => {
      if (typeof quote === "string") {
        const text = quote.trim()
        return text ? { text, speaker: "Pastor" } : null
      }
      if (!isRecord(quote)) return null
      const text = cleanString(quote.text)
      if (!text) return null
      return { text, speaker: normalizeSpeaker(quote.speaker) }
    })
    .filter((quote): quote is SermonQuote => quote !== null)
}

function normalizeSpeaker(value: unknown): string {
  const speaker = cleanString(value)
  if (!speaker || speaker === "Preacher" || speaker === "Speaker")
    return "Pastor"
  return speaker
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}

function emptyFlowPoint(point: string): SermonFlowPoint {
  return {
    point,
    explanation: "",
    scripture_refs: [],
    illustration_or_moment: "",
    application: "",
  }
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function withLegacyAccessors(summary: RichSummary): SermonSummary {
  const value = summary as SermonSummary
  Object.defineProperties(value, {
    topic: {
      enumerable: false,
      get: () => value.title,
    },
    main_points: {
      enumerable: false,
      get: () => value.sermon_flow.main_points.map((point) => point.point),
    },
  })
  return value
}
