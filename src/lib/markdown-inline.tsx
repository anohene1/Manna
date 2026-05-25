import { Fragment } from "react"

export interface InlineToken {
  text: string
  bold: boolean
  italic: boolean
}

/**
 * Tokenize a string into runs of {text, bold, italic}. Greedy outer match —
 * `**a *b* c**` → single bold run "a *b* c". Unmatched markers render literally.
 */
export function tokenizeInlineMarkdown(src: string): InlineToken[] {
  if (src.length === 0) return []
  const tokens: InlineToken[] = []
  let i = 0
  while (i < src.length) {
    if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2)
      if (end > i + 2) {
        tokens.push({ text: src.slice(i + 2, end), bold: true, italic: false })
        i = end + 2
        continue
      }
    } else if (src[i] === "*") {
      const end = src.indexOf("*", i + 1)
      if (end > i + 1) {
        tokens.push({ text: src.slice(i + 1, end), bold: false, italic: true })
        i = end + 1
        continue
      }
    }
    let next = i + 1
    while (next < src.length && src[next] !== "*") next++
    tokens.push({ text: src.slice(i, next), bold: false, italic: false })
    i = next
  }
  const merged: InlineToken[] = []
  for (const t of tokens) {
    const last = merged[merged.length - 1]
    if (last && !last.bold && !last.italic && !t.bold && !t.italic) {
      last.text += t.text
    } else {
      merged.push({ ...t })
    }
  }
  return merged
}

/** Render markdown as a React node tree (no innerHTML). */
export function renderInlineMarkdown(src: string): React.ReactNode {
  const tokens = tokenizeInlineMarkdown(src)
  return (
    <>
      {tokens.map((t, idx) => {
        if (t.bold) return <strong key={idx}>{t.text}</strong>
        if (t.italic) return <em key={idx}>{t.text}</em>
        return <Fragment key={idx}>{t.text}</Fragment>
      })}
    </>
  )
}
