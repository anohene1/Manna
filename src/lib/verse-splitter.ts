/**
 * Pure verse-splitting helpers. No DOM, no store access — easy to unit-test.
 * Used by queue-store.addItem to slice long verses into readable slides.
 */

const DEFAULT_TARGET = 25
const DEFAULT_MIN = 15

/** Whitespace-tolerant word count. */
export function wordCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/**
 * Split a long verse into chunks ≤ targetWords, honoring sentence then
 * clause then word boundaries. Returns `[text]` unchanged when no split is
 * warranted.
 */
export function splitVerseIntoChunks(
  text: string,
  targetWords: number = DEFAULT_TARGET,
  minWords: number = DEFAULT_MIN,
): string[] {
  if (text.length === 0) return [""]
  if (wordCount(text) <= targetWords) return [text.trim()]

  // 1. Sentence split. Keep trailing punctuation on each atom.
  const atoms = sentenceSplit(text).flatMap((s) => recurseSplit(s, targetWords))

  // 2. Greedy pack atoms into chunks ≤ targetWords with a min-word floor.
  return packAtoms(atoms, targetWords, minWords)
}

/** Split on `. ! ?` followed by whitespace or EOS. Punctuation stays. */
function sentenceSplit(text: string): string[] {
  const out: string[] = []
  const re = /[^.!?]+(?:[.!?]+|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const piece = m[0].trim()
    if (piece) out.push(piece)
  }
  return out.length > 0 ? out : [text.trim()]
}

/** If atom > targetWords, split on `;` then `:` then `,` then hard word count. */
function recurseSplit(atom: string, targetWords: number): string[] {
  if (wordCount(atom) <= targetWords) return [atom]
  for (const delim of [";", ":", ","]) {
    if (atom.includes(delim)) {
      const parts = clauseSplit(atom, delim)
      if (parts.length > 1) {
        return parts.flatMap((p) => recurseSplit(p, targetWords))
      }
    }
  }
  return hardWordSplit(atom, targetWords)
}

/** Split a string at every occurrence of `delim`, keeping the delim attached
 *  to the LEFT part (so "a, b, c" → ["a,", "b,", "c"]). */
function clauseSplit(s: string, delim: string): string[] {
  const out: string[] = []
  let buf = ""
  for (const ch of s) {
    buf += ch
    if (ch === delim) {
      const t = buf.trim()
      if (t) out.push(t)
      buf = ""
    }
  }
  const tail = buf.trim()
  if (tail) out.push(tail)
  return out
}

/** Fallback when no punctuation hints exist — split on whitespace at targetWords. */
function hardWordSplit(s: string, targetWords: number): string[] {
  const words = s.trim().split(/\s+/)
  const out: string[] = []
  for (let i = 0; i < words.length; i += targetWords) {
    out.push(words.slice(i, i + targetWords).join(" "))
  }
  return out
}

/** Greedy pack atoms into chunks. Enforce minWords floor by allowing the
 *  final chunk to overshoot targetWords slightly rather than emit a small
 *  orphan. */
function packAtoms(
  atoms: string[],
  targetWords: number,
  minWords: number,
): string[] {
  const chunks: string[] = []
  let current = ""
  let currentWords = 0

  for (const atom of atoms) {
    const w = wordCount(atom)
    if (currentWords === 0) {
      current = atom
      currentWords = w
      continue
    }
    if (currentWords + w <= targetWords) {
      current = `${current} ${atom}`
      currentWords += w
    } else if (currentWords < minWords) {
      current = `${current} ${atom}`
      currentWords += w
    } else {
      chunks.push(current)
      current = atom
      currentWords = w
    }
  }
  if (current) chunks.push(current)

  // Merge a small trailing orphan back into the previous chunk if any chunk
  // would otherwise drop below minWords.
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1]
    if (wordCount(last) < minWords) {
      chunks[chunks.length - 2] = `${chunks[chunks.length - 2]} ${last}`
      chunks.pop()
    }
  }

  return chunks
}
