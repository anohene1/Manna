import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "./builtin-themes"
import {
  liftLowerThirdAboveTicker,
  overlayMotionFrame,
  tickerMessageX,
} from "./broadcast-composition"

describe("camera program composition", () => {
  it("lifts the lower third above the ticker without mutating the theme", () => {
    const theme = BUILTIN_THEMES.find(
      (candidate) => candidate.kind === "lower-third"
    )!
    const originalOffset = theme.layout.offsetY
    const adjusted = liftLowerThirdAboveTicker(theme, 1080)

    expect(adjusted.layout.offsetY).toBe(originalOffset - 103)
    expect(theme.layout.offsetY).toBe(originalOffset)
  })

  it("moves short ticker text fully off the left edge before restarting", () => {
    expect(tickerMessageX(1920, 300, 0, 192)).toBe(1920)
    expect(tickerMessageX(1920, 300, 2220, 192)).toBe(-300)
    expect(tickerMessageX(1920, 300, 2411, 192)).toBe(-491)
    expect(tickerMessageX(1920, 300, 2412, 192)).toBe(1920)
  })

  it("uses a subtle fade-and-rise for overlay entry and removal", () => {
    expect(overlayMotionFrame("enter", 1000, 1000)).toEqual({
      opacity: 0,
      offsetY: 22,
      complete: false,
    })
    expect(overlayMotionFrame("enter", 1000, 1240)).toEqual({
      opacity: 1,
      offsetY: 0,
      complete: true,
    })
    expect(overlayMotionFrame("exit", 1000, 1240)).toEqual({
      opacity: 0,
      offsetY: 14,
      complete: true,
    })
  })
})
