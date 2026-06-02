import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "./builtin-themes"
import { computeVerseLayoutMetrics } from "./verse-renderer"
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
    },
  )
})
