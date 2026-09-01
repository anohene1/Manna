export type HtmlHighlightKind =
  | "plain"
  | "comment"
  | "doctype"
  | "punctuation"
  | "tag"
  | "attribute"
  | "string"
  | "css-selector"
  | "css-property"
  | "css-value"
  | "number"
  | "placeholder"

export interface HtmlHighlightToken {
  kind: HtmlHighlightKind
  text: string
}

const PLACEHOLDER_PATTERN = /\{\{[A-Za-z][\w]*\}\}/g
const HTML_PART_PATTERN =
  /<!--[\s\S]*?-->|<!doctype[\s\S]*?>|<\/?[A-Za-z][^>]*>|[^<]+|</gi

function pushPlaceholders(
  tokens: HtmlHighlightToken[],
  text: string,
  fallbackKind: HtmlHighlightKind
) {
  let cursor = 0

  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const index = match.index ?? 0
    if (index > cursor) {
      tokens.push({ kind: fallbackKind, text: text.slice(cursor, index) })
    }
    tokens.push({ kind: "placeholder", text: match[0] })
    cursor = index + match[0].length
  }

  if (cursor < text.length) {
    tokens.push({ kind: fallbackKind, text: text.slice(cursor) })
  }
}

function tokenizeTag(source: string): HtmlHighlightToken[] {
  const tokens: HtmlHighlightToken[] = []
  const tagMatch = source.match(/^(<\/?)([A-Za-z][\w:-]*)/)

  if (!tagMatch) {
    return [{ kind: "plain", text: source }]
  }

  tokens.push({ kind: "punctuation", text: tagMatch[1] })
  tokens.push({ kind: "tag", text: tagMatch[2] })

  const remainderStart = tagMatch[0].length
  let cursor = remainderStart
  const remainder = source.slice(remainderStart)
  const partPattern =
    /(\s+|\{\{[A-Za-z][\w]*\}\}|[A-Za-z_:][\w:.-]*(?=\s*=)|=|"[^"\r\n]*"|'[^'\r\n]*'|\/?>|[^\s=]+)/g

  for (const match of remainder.matchAll(partPattern)) {
    const index = remainderStart + (match.index ?? 0)
    if (index > cursor) {
      tokens.push({ kind: "plain", text: source.slice(cursor, index) })
    }

    const text = match[0]
    let kind: HtmlHighlightKind = "plain"
    if (/^\s+$/.test(text)) kind = "plain"
    else if (/^\{\{/.test(text)) kind = "placeholder"
    else if (/^\/?>$/.test(text) || text === "=") kind = "punctuation"
    else if (/^["']/.test(text)) kind = "string"
    else if (/^[A-Za-z_:][\w:.-]*$/.test(text)) kind = "attribute"

    tokens.push({ kind, text })
    cursor = index + text.length
  }

  if (cursor < source.length) {
    tokens.push({ kind: "plain", text: source.slice(cursor) })
  }

  return tokens
}

function tokenizeCss(source: string): HtmlHighlightToken[] {
  const tokens: HtmlHighlightToken[] = []
  const pattern =
    /\/\*[\s\S]*?\*\/|\{\{[A-Za-z][\w]*\}\}|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[0-9a-fA-F]{3,8}\b|-?(?:\d*\.)?\d+(?:px|rem|em|%|vh|vw|vmin|vmax|s|ms|deg)?\b|--[\w-]+|[{}:;(),]|[^{}:;(),\s]+|\s+/g
  let cursor = 0
  let inBlock = false
  let expectingProperty = false

  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) {
      tokens.push({ kind: "plain", text: source.slice(cursor, index) })
    }

    const text = match[0]
    let kind: HtmlHighlightKind = "plain"

    if (text.startsWith("/*")) kind = "comment"
    else if (text.startsWith("{{")) kind = "placeholder"
    else if (/^["']/.test(text)) kind = "string"
    else if (/^-?(?:\d*\.)?\d/.test(text) || /^#[0-9a-fA-F]{3,8}$/.test(text)) {
      kind = "number"
    } else if (/^[{}:;(),]$/.test(text)) {
      kind = "punctuation"
    } else if (!/^\s+$/.test(text)) {
      kind = !inBlock
        ? "css-selector"
        : expectingProperty
          ? "css-property"
          : "css-value"
    }

    tokens.push({ kind, text })

    if (text === "{") {
      inBlock = true
      expectingProperty = true
    } else if (text === "}") {
      inBlock = false
      expectingProperty = false
    } else if (text === ";" && inBlock) {
      expectingProperty = true
    } else if (text === ":" && inBlock) {
      expectingProperty = false
    } else if (inBlock && !/^\s+$/.test(text) && kind === "css-property") {
      expectingProperty = false
    }

    cursor = index + text.length
  }

  if (cursor < source.length) {
    tokens.push({ kind: "plain", text: source.slice(cursor) })
  }

  return tokens
}

/** Tokenizes an HTML lower-third without changing or normalizing its source. */
export function highlightHtmlTemplate(source: string): HtmlHighlightToken[] {
  const tokens: HtmlHighlightToken[] = []
  let inStyle = false

  for (const match of source.matchAll(HTML_PART_PATTERN)) {
    const part = match[0]

    if (part.startsWith("<!--")) {
      tokens.push({ kind: "comment", text: part })
    } else if (/^<!doctype/i.test(part)) {
      tokens.push({ kind: "doctype", text: part })
    } else if (part.startsWith("<")) {
      tokens.push(...tokenizeTag(part))
      if (/^<style(?:\s|>)/i.test(part)) inStyle = true
      if (/^<\/style\s*>/i.test(part)) inStyle = false
    } else if (inStyle) {
      tokens.push(...tokenizeCss(part))
    } else {
      pushPlaceholders(tokens, part, "plain")
    }
  }

  return tokens
}
