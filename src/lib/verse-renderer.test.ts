import { describe, expect, it, vi } from "vitest"
import { BUILTIN_THEMES } from "./builtin-themes"
import { computeVerseLayoutMetrics, renderVerse } from "./verse-renderer"
import type { BroadcastTheme, VerseRenderData } from "@/types"

function measureContext(): CanvasRenderingContext2D {
  return {
    save: () => {},
    restore: () => {},
    measureText: (text: string) => ({ width: text.length * 24 }),
  } as unknown as CanvasRenderingContext2D
}

const verse: VerseRenderData = {
  reference: "John 3:16 (KJV)",
  segments: [{ verseNumber: 16, text: "For God so loved the world." }],
}

describe("verse renderer layout", () => {
  it.each(["center-left", "center-right"] as const)(
    "computes finite layout metrics for %s anchor",
    (anchor) => {
      const theme: BroadcastTheme = {
        ...BUILTIN_THEMES[0],
        layout: {
          ...BUILTIN_THEMES[0].layout,
          anchor,
        },
      }

      const metrics = computeVerseLayoutMetrics(measureContext(), theme, verse)

      expect(Number.isFinite(metrics.textAreaRect.x)).toBe(true)
      expect(Number.isFinite(metrics.textAreaRect.y)).toBe(true)
      expect(Number.isFinite(metrics.textRect.x)).toBe(true)
      expect(Number.isFinite(metrics.textRect.y)).toBe(true)
    }
  )

  it("keeps lower-third layout inside the bottom safe area", () => {
    const theme = BUILTIN_THEMES.find(
      (candidate) => candidate.kind === "lower-third"
    )!
    const metrics = computeVerseLayoutMetrics(measureContext(), theme, verse)

    expect(metrics.textAreaRect.y).toBeGreaterThan(
      theme.resolution.height * 0.5
    )
  })

  it("grows a lower-third background to contain longer wrapped verses", () => {
    const theme = BUILTIN_THEMES.find(
      (candidate) => candidate.id === "builtin-lower-third-minimal"
    )!
    const shortMetrics = computeVerseLayoutMetrics(
      measureContext(),
      theme,
      verse
    )
    const longMetrics = computeVerseLayoutMetrics(measureContext(), theme, {
      reference: "Psalm 119:105–108 (KJV)",
      segments: [
        {
          text: Array.from(
            { length: 3 },
            () => "Thy word is a lamp unto my feet and a light unto my path"
          ).join(" "),
        },
      ],
    })

    expect(longMetrics.textAreaRect.height).toBeGreaterThan(
      shortMetrics.textAreaRect.height
    )
    expect(
      longMetrics.verseRect!.y + longMetrics.verseRect!.height
    ).toBeLessThanOrEqual(
      longMetrics.textAreaRect.y + longMetrics.textAreaRect.height
    )
  })

  it("preserves existing canvas pixels when background rendering is skipped", () => {
    const fillRect = vi.fn()
    const context = {
      ...measureContext(),
      fillRect,
    } as unknown as CanvasRenderingContext2D
    const theme: BroadcastTheme = {
      ...BUILTIN_THEMES[0],
      logo: null,
      textBox: { ...BUILTIN_THEMES[0].textBox, enabled: false },
    }

    renderVerse(context, theme, null, { skipBackground: true })

    expect(fillRect).not.toHaveBeenCalled()
  })
})
