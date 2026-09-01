import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "./builtin-themes"

describe("built-in broadcast themes", () => {
  it("ships slide themes and camera lower-third presets", () => {
    expect(BUILTIN_THEMES.map((theme) => theme.id)).toEqual([
      "builtin-bold-proclamation",
      "builtin-bold-crimson",
      "builtin-bold-cobalt",
      "builtin-bold-chapel",
      "builtin-lower-third-classic",
      "builtin-lower-third-minimal",
      "builtin-lower-third-bold-accent",
      "builtin-html-gilded-editorial",
      "builtin-html-slate-split",
      "builtin-html-ochre-ribbon",
      "builtin-html-amber-spine",
      "builtin-html-concrete-grid",
      "builtin-html-terracotta-studio",
      "builtin-html-monochrome-masthead",
      "builtin-html-cathedral-rule",
      "builtin-html-quiet-anchor",
      "builtin-html-ghost-scrim",
    ])
  })

  it("ships ten static, placeholder-driven HTML lower thirds", () => {
    const htmlThemes = BUILTIN_THEMES.filter((theme) => theme.htmlTemplate)
    expect(htmlThemes).toHaveLength(10)
    for (const theme of htmlThemes) {
      expect(theme.kind).toBe("lower-third")
      expect(theme.htmlTemplate?.source).toContain("{{verse}}")
      expect(theme.htmlTemplate?.source).toMatch(/\{\{reference(?:Plain)?\}\}/)
      expect(theme.htmlTemplate?.source).toContain("data-manna-lower-third")
      expect(theme.htmlTemplate?.source).not.toContain("fonts.googleapis.com")
      expect(theme.htmlTemplate?.source).not.toContain("box-shadow")
      expect(theme.htmlTemplate?.source).not.toContain("gradient(")
      expect(theme.htmlTemplate?.source).not.toContain("{{churchName}}")
      expect(theme.htmlTemplate?.source).not.toMatch(/\bLive\b/)
    }
  })

  it("does not repeat a parenthesized translation beside a translation label", () => {
    const htmlThemes = BUILTIN_THEMES.filter((theme) => theme.htmlTemplate)
    for (const theme of htmlThemes) {
      const source = theme.htmlTemplate!.source
      if (source.includes("{{translation}}")) {
        expect(source).toContain("{{referencePlain}}")
        expect(source).not.toContain("{{reference}}")
      }
    }
  })

  it("uses adaptive metadata instead of hard-coded scripture labels", () => {
    const htmlThemes = BUILTIN_THEMES.filter((theme) => theme.htmlTemplate)
    for (const theme of htmlThemes) {
      const source = theme.htmlTemplate!.source
      expect(source).not.toMatch(/>Scripture(?: reading)?</i)
      if (source.includes("{{translation}}")) {
        expect(source).toContain("data-manna-translation")
      }
    }
  })

  it("omits requested decorative tags from the affected presets", () => {
    const sourceById = new Map(
      BUILTIN_THEMES.map((theme) => [
        theme.id,
        theme.htmlTemplate?.source ?? "",
      ])
    )
    expect(sourceById.get("builtin-html-concrete-grid")).not.toMatch(
      /Order of worship|>Scripture</i
    )
    expect(sourceById.get("builtin-html-ghost-scrim")).not.toContain(
      "Scripture broadcast"
    )
    expect(sourceById.get("builtin-html-monochrome-masthead")).not.toContain(
      "The living word"
    )
  })

  it("ships Minimal Gradient with a real text-box gradient fill", () => {
    const theme = BUILTIN_THEMES.find(
      (candidate) => candidate.id === "builtin-lower-third-minimal"
    )
    expect(theme?.textBox.gradient).toEqual(
      expect.objectContaining({ type: "linear" })
    )
    expect(theme?.textBox.gradient?.stops.length).toBeGreaterThanOrEqual(2)
  })

  it("keeps a top-left logo on every camera lower third", () => {
    const lowerThirds = BUILTIN_THEMES.filter(
      (theme) => theme.kind === "lower-third"
    )
    expect(lowerThirds).not.toHaveLength(0)
    for (const theme of lowerThirds) {
      expect(theme.logo).toEqual(
        expect.objectContaining({ position: "top-left" })
      )
    }
  })
})
