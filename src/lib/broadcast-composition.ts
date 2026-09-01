import type { BroadcastTheme } from "@/types"

export function liftLowerThirdAboveTicker(
  theme: BroadcastTheme,
  outputHeight: number
): BroadcastTheme {
  return {
    ...theme,
    layout: {
      ...theme.layout,
      offsetY: theme.layout.offsetY - Math.round(outputHeight * 0.095),
    },
  }
}

/** Move one ticker message completely on and off screen before restarting. */
export function tickerMessageX(
  outputWidth: number,
  textWidth: number,
  scrollOffset: number,
  gap: number
): number {
  const cycleDistance = outputWidth + textWidth + gap
  return outputWidth - (scrollOffset % cycleDistance)
}

export interface OverlayMotionFrame {
  opacity: number
  offsetY: number
  complete: boolean
}

export function overlayMotionFrame(
  phase: "enter" | "exit",
  startedAt: number,
  now: number,
  duration = 240
): OverlayMotionFrame {
  const progress = Math.min(Math.max((now - startedAt) / duration, 0), 1)
  const eased = 1 - Math.pow(1 - progress, 3)
  return {
    opacity: phase === "enter" ? eased : 1 - eased,
    offsetY: phase === "enter" ? (1 - eased) * 22 : eased * 14,
    complete: progress >= 1,
  }
}
