import type { BroadcastTheme, NotesSlide } from "@/types"
import { tokenizeInlineMarkdown, type InlineToken } from "./markdown-inline"

interface Run {
  text: string
  font: string
  width: number
}

/**
 * Paint a NotesSlide onto the given 2D canvas context using the theme's
 * verse typography. Auto-shrinks font size when content overflows the
 * vertical extent (min cap 24px). Returns true if successfully drawn.
 */
export function renderNotes(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  slide: NotesSlide,
  width: number,
  height: number,
): boolean {
  ctx.fillStyle = theme.background.color || "#000"
  ctx.fillRect(0, 0, width, height)

  // Always show a title — fall back to a generic label when the operator
  // hasn't supplied one. Keeps every notes slide visually anchored.
  const displayTitle = slide.title.trim() || "Sermon Notes"

  if (slide.bullets.length === 0) return true

  const verseFamily = theme.verseText.fontFamily
  const verseColor = theme.verseText.color
  const refFamily = theme.reference.fontFamily
  const refColor = theme.reference.color

  const padX = Math.max(60, width * 0.1)
  const padY = Math.max(60, height * 0.1)

  const titleScale = 0.72
  const bulletGap = 0.45    // vertical breathing between bullets, in line-heights
  const chipPadRight = 24
  const minFontSize = 24
  const titleBlockGap = 1.4 // multiplier of titleSize for gap after title block

  // Iteratively shrink until wrapped layout fits the height budget.
  let fontSize = Math.min(theme.verseText.fontSize, Math.floor(height * 0.065))
  if (fontSize < 32) fontSize = 32

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type Layout = { lines: string[][]; rowHeights: number[]; lineHeight: number; totalH: number }
  const layoutFor = (size: number): Layout => {
    const lineHeight = size * 1.4
    const chipDiameter = size * 0.55 * 2
    const textX = padX + chipDiameter + chipPadRight
    const maxTextW = width - textX - padX
    const lines: string[][] = []
    const rowHeights: number[] = []
    let totalH = size * titleScale * (titleBlockGap + 0.4)
    for (const b of slide.bullets) {
      const wrapped = wrapText(ctx, b.markdown, size, verseFamily, theme.verseText.fontWeight, maxTextW)
      lines.push(wrapped)
      const h = wrapped.length * lineHeight + size * bulletGap
      rowHeights.push(h)
      totalH += h
    }
    return { lines, rowHeights, lineHeight, totalH }
  }

  let layout = layoutFor(fontSize)
  while (fontSize > minFontSize && layout.totalH > height - padY * 2) {
    fontSize -= 2
    layout = layoutFor(fontSize)
  }

  let cursorY = padY

  {
    const titleSize = fontSize * titleScale
    const titleWeight = Math.max(theme.reference.fontWeight, 600)
    // Slight tracking when supported — Chromium-only on canvas; harmless on
    // WebKit (ignored).
    type CtxWithSpacing = CanvasRenderingContext2D & { letterSpacing?: string }
    const ctxLs = ctx as CtxWithSpacing
    const prevSpacing = ctxLs.letterSpacing
    ctxLs.letterSpacing = `${Math.max(0.5, titleSize * 0.01)}px`

    ctx.font = `${titleWeight} ${titleSize}px ${refFamily}`
    ctx.fillStyle = refColor
    ctx.textBaseline = "top"
    ctx.fillText(displayTitle, padX, cursorY)
    const titleW = ctx.measureText(displayTitle).width

    // Restore spacing for the rule + bullets that follow.
    ctxLs.letterSpacing = prevSpacing ?? "normal"

    // Underline rule — sized to the title, slim, faint accent.
    const ruleY = cursorY + titleSize * 1.18
    const ruleH = Math.max(2, Math.floor(titleSize * 0.05))
    ctx.fillStyle = refColor
    ctx.globalAlpha = 0.45
    ctx.fillRect(padX, ruleY, Math.min(titleW, width - padX * 2), ruleH)
    ctx.globalAlpha = 1

    cursorY += titleSize * (titleBlockGap + 0.4)
  }

  const chipRadius = fontSize * 0.55
  const chipDiameter = chipRadius * 2
  const lineHeight = layout.lineHeight
  for (let i = 0; i < slide.bullets.length; i++) {
    const chipCx = padX + chipRadius
    const chipCy = cursorY + fontSize * 0.6
    ctx.beginPath()
    ctx.arc(chipCx, chipCy, chipRadius, 0, Math.PI * 2)
    ctx.fillStyle = refColor
    ctx.fill()

    ctx.font = `bold ${Math.floor(fontSize * 0.55)}px ${verseFamily}`
    ctx.fillStyle = pickContrastColor(refColor)
    ctx.textBaseline = "middle"
    ctx.textAlign = "center"
    ctx.fillText(String(i + 1), chipCx, chipCy + 1)

    ctx.textAlign = "left"
    ctx.textBaseline = "top"
    const textX = padX + chipDiameter + chipPadRight
    const wrappedLines = layout.lines[i]
    let lineY = cursorY
    for (const line of wrappedLines) {
      const tokens = tokenizeInlineMarkdown(line)
      const runs = tokensToRuns(ctx, tokens, fontSize, verseFamily, theme.verseText.fontWeight)
      let x = textX
      ctx.fillStyle = verseColor
      for (const r of runs) {
        ctx.font = r.font
        ctx.fillText(r.text, x, lineY)
        x += r.width
      }
      lineY += lineHeight
    }
    cursorY += layout.rowHeights[i]
  }

  return true
}

/** Greedy word-wrap that strips markdown markers for width measurement, then
 *  returns the un-stripped source split into lines by the word boundaries
 *  found on the stripped text. Each returned line will re-parse markdown
 *  cleanly because markers always live inside a single word boundary group. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  src: string,
  size: number,
  family: string,
  weight: number,
  maxWidth: number,
): string[] {
  if (!src.trim()) return [""]
  const words = src.split(/(\s+)/) // keep separators
  ctx.font = `${weight} ${size}px ${family}`
  const lines: string[] = []
  let current = ""
  for (const w of words) {
    const test = current + w
    const visible = test.replace(/\*\*|\*/g, "")
    if (ctx.measureText(visible).width <= maxWidth || current === "") {
      current = test
    } else {
      lines.push(current.trimEnd())
      current = w.trimStart()
    }
  }
  if (current) lines.push(current.trimEnd())
  return lines.length > 0 ? lines : [src]
}

/** Return "#fff" or "#000" for best contrast against the given hex color.
 *  Falls back to white when the color is unparseable. */
function pickContrastColor(hex: string): string {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return "#fff"
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.55 ? "#000" : "#fff"
}

function tokensToRuns(
  ctx: CanvasRenderingContext2D,
  tokens: InlineToken[],
  size: number,
  family: string,
  baseWeight: number,
): Run[] {
  const runs: Run[] = []
  for (const t of tokens) {
    const weight = t.bold ? Math.max(700, baseWeight) : baseWeight
    const style = t.italic ? "italic" : "normal"
    const font = `${style} ${weight} ${size}px ${family}`
    ctx.font = font
    runs.push({ text: t.text, font, width: ctx.measureText(t.text).width })
  }
  return runs
}
