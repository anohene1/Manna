import type { BroadcastTheme, VerseRenderData } from "@/types/broadcast"

const BLOCKED_ELEMENTS =
  /<(script|iframe|object|embed|link|base|meta)\b[^>]*>[\s\S]*?<\/\1\s*>|<(script|iframe|object|embed|link|base|meta)\b[^>]*\/?>/gi
const EVENT_ATTRIBUTES = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
const JAVASCRIPT_URLS = /\b(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi
const CSS_IMPORTS = /@import\s+[^;]+;/gi

export interface HtmlLowerThirdValues {
  verse: string
  reference: string
  referencePlain: string
  verseNumber: string
  translation: string
  contentType: "scripture" | "song"
  contentLabel: string
  translationLabel: string
  contentMeta: string
  contentMarker: string
  contentWatermark: string
  churchName: string
  logoUrl: string
  tickerOffset: number
}

export function sanitizeHtmlLowerThird(source: string): string {
  return source
    .replace(BLOCKED_ELEMENTS, "")
    .replace(EVENT_ATTRIBUTES, "")
    .replace(JAVASCRIPT_URLS, '$1="#"')
    .replace(CSS_IMPORTS, "")
}

export function escapeTemplateValue(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function valuesForVerse(
  verse: VerseRenderData | null,
  tickerActive = false,
  brand: { churchName?: string; logoUrl?: string } = {}
): HtmlLowerThirdValues {
  const reference = verse?.reference ?? ""
  const translationMatch = reference.match(/\(([^()]+)\)\s*$/)
  const contentType = verse?.contentType ?? "scripture"
  const translation =
    contentType === "scripture" ? (translationMatch?.[1] ?? "") : ""
  const verseNumber =
    contentType === "scripture"
      ? (verse?.segments
          .map((segment) => segment.verseNumber)
          .filter((number): number is number => number !== undefined)
          .join("–") ?? "")
      : ""
  return {
    verse: verse?.segments.map((segment) => segment.text).join(" ") ?? "",
    reference,
    referencePlain:
      contentType === "scripture"
        ? reference.replace(/\s*\([^()]+\)\s*$/, "").trim()
        : reference,
    verseNumber,
    translation,
    contentType,
    contentLabel: contentType === "song" ? "Song lyrics" : "Scripture",
    translationLabel:
      contentType === "song"
        ? "Song lyrics"
        : translation
          ? `${translation} translation`
          : "Scripture",
    contentMeta:
      contentType === "song"
        ? "Song lyrics"
        : translation
          ? `${translation} / Scripture`
          : "Scripture",
    contentMarker: contentType === "song" ? "LYRICS" : verseNumber,
    contentWatermark: contentType === "song" ? "LYRICS" : "WORD",
    churchName: brand.churchName?.trim() ?? "",
    logoUrl: brand.logoUrl ?? "/ag-logo.png",
    tickerOffset: tickerActive ? 110 : 0,
  }
}

export function applyHtmlLowerThirdValues(
  source: string,
  values: HtmlLowerThirdValues
): string {
  const replacements: Record<string, string> = {
    verse: values.verse,
    reference: values.reference,
    referencePlain: values.referencePlain,
    verseNumber: values.verseNumber,
    translation: values.translation,
    contentType: values.contentType,
    contentLabel: values.contentLabel,
    translationLabel: values.translationLabel,
    contentMeta: values.contentMeta,
    contentMarker: values.contentMarker,
    contentWatermark: values.contentWatermark,
    churchName: values.churchName,
    logoUrl: values.logoUrl,
  }
  let result = sanitizeHtmlLowerThird(source)
  for (const [name, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${name}}}`, escapeTemplateValue(value))
  }
  return result
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export function buildHtmlLowerThirdSvg(
  source: string,
  values: HtmlLowerThirdValues,
  width: number,
  height: number
): string {
  const populated = applyHtmlLowerThirdValues(source, values)
  const parser = new DOMParser()
  const document = parser.parseFromString(populated, "text/html")
  for (const node of document.querySelectorAll(
    "script, iframe, object, embed, link, base, meta"
  )) {
    node.remove()
  }
  for (const element of document.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  const styles = [...document.querySelectorAll("style")]
    .map((style) => style.textContent ?? "")
    .join("\n")
    .replace(CSS_IMPORTS, "")
  document.querySelectorAll("style").forEach((style) => style.remove())
  const serializer = new XMLSerializer()
  const body = [...document.body.childNodes]
    .map((node) => serializer.serializeToString(node))
    .join("")
  const bodyClass = escapeTemplateValue(document.body.className)
  const bodyStyle = escapeTemplateValue(
    document.body.getAttribute("style") ?? ""
  )
  const contentClass = values.verse.trim()
    ? "manna-has-verse"
    : "manna-no-verse"
  const translationClass = values.translation
    ? "manna-has-translation"
    : "manna-no-translation"
  const baseCss = `
    html, body, #manna-template-root { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    #manna-template-root { position: relative; box-sizing: border-box; color: white;
      --manna-width: ${width}px; --manna-height: ${height}px;
      --manna-safe-left: ${Math.round(width * 0.05)}px;
      --manna-safe-right: ${Math.round(width * 0.05)}px;
      --manna-safe-bottom: ${Math.round(height * 0.05)}px;
      --manna-ticker-offset: ${values.tickerOffset}px; }
    *, *::before, *::after { box-sizing: border-box; }
    [data-manna-lower-third] { transform: translateY(calc(-1 * var(--manna-ticker-offset))); }
    .manna-no-verse [data-manna-lower-third] { display: none !important; }
    .manna-content-song [data-manna-scripture-only], .manna-content-scripture [data-manna-song-only],
    .manna-no-translation [data-manna-translation] { display: none !important; }
  `
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><body xmlns="http://www.w3.org/1999/xhtml" id="manna-template-root" class="${bodyClass} ${contentClass} manna-content-${values.contentType} ${translationClass}" style="${bodyStyle}"><style>${escapeXml(baseCss + styles)}</style>${body}</body></foreignObject></svg>`
}

const imageCache = new Map<string, Promise<HTMLImageElement>>()
const MAX_CACHE_ENTRIES = 24

export function getHtmlLowerThirdImage(
  theme: BroadcastTheme,
  verse: VerseRenderData | null,
  tickerActive = false,
  brand: { churchName?: string; logoUrl?: string } = {}
): Promise<HTMLImageElement> | null {
  const source = theme.htmlTemplate?.source
  if (!source) return null
  const values = valuesForVerse(verse, tickerActive, brand)
  const key = JSON.stringify([source, values, theme.resolution])
  const cached = imageCache.get(key)
  if (cached) return cached

  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    const svg = buildHtmlLowerThirdSvg(
      source,
      values,
      theme.resolution.width,
      theme.resolution.height
    )
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(
        new Error(`Could not render HTML lower-third theme “${theme.name}”.`)
      )
    }
    image.src = url
  })
  imageCache.set(key, request)
  if (imageCache.size > MAX_CACHE_ENTRIES) {
    imageCache.delete(imageCache.keys().next().value as string)
  }
  request.catch(() => imageCache.delete(key))
  return request
}
