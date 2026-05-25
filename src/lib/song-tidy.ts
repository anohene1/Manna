import type { Song, SongStanza } from "@/types"

export interface TidyOptions {
  aggressive: boolean
}

export interface TidyResult {
  stanzas: SongStanza[]
  chorus: SongStanza | null
  splits: number
}

const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z])/
const COMMA_PRONOUN = /,\s+(?=(?:I|You|He|She|We|They)\b)/

function splitLine(line: string, aggressive: boolean): string[] {
  const sentenceParts = line.split(SENTENCE_BREAK)
  if (!aggressive) return sentenceParts.map((p) => p.trim()).filter(Boolean)
  const out: string[] = []
  for (const part of sentenceParts) {
    for (const sub of part.split(COMMA_PRONOUN)) {
      const trimmed = sub.trim()
      if (trimmed) out.push(trimmed)
    }
  }
  return out
}

function tidyStanza(stanza: SongStanza, aggressive: boolean): { stanza: SongStanza; splits: number } {
  let splits = 0
  const lines: string[] = []
  for (const line of stanza.lines) {
    const parts = splitLine(line, aggressive)
    if (parts.length > 1) splits += parts.length - 1
    for (const p of parts) lines.push(p)
  }
  return { stanza: { ...stanza, lines }, splits }
}

export function tidySong(song: Song, opts: TidyOptions): TidyResult {
  let splits = 0
  const stanzas = song.stanzas.map((s) => {
    const result = tidyStanza(s, opts.aggressive)
    splits += result.splits
    return result.stanza
  })
  let chorus: SongStanza | null = null
  if (song.chorus) {
    const result = tidyStanza(song.chorus, opts.aggressive)
    splits += result.splits
    chorus = result.stanza
  }
  return { stanzas, chorus, splits }
}
