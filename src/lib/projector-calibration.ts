/** Inset fractions of the projector frame, one per side (0 = no inset). */
export interface CalibrationInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/** CSS-ready transform mapping full-frame content into the visible rect. */
export interface CalibrationTransform {
  scale: number
  offsetX: number
  offsetY: number
}

/** Handles the editor exposes: 4 corners + 4 edges. */
export type CalibrationHandle =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"

export const IDENTITY_INSETS: CalibrationInsets = { top: 0, right: 0, bottom: 0, left: 0 }

const MAX_SIDE = 0.4
const MAX_PAIR = 0.8

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Clamp each side to [0, 0.4] and ensure opposite pairs sum <= 0.8. */
export function clampInsets(insets: CalibrationInsets): CalibrationInsets {
  let top = clamp(insets.top, 0, MAX_SIDE)
  let right = clamp(insets.right, 0, MAX_SIDE)
  let bottom = clamp(insets.bottom, 0, MAX_SIDE)
  let left = clamp(insets.left, 0, MAX_SIDE)

  if (top + bottom > MAX_PAIR) {
    bottom -= top + bottom - MAX_PAIR
  }
  if (left + right > MAX_PAIR) {
    right -= left + right - MAX_PAIR
  }
  return { top, right, bottom, left }
}

/** Convert insets -> uniform-scale transform that fits 16:9 content inside the
 *  visible rect, centered. */
export function insetsToTransform(
  insets: CalibrationInsets,
  frameWidth: number,
  frameHeight: number,
): CalibrationTransform {
  const { top, right, bottom, left } = clampInsets(insets)
  const vx = left * frameWidth
  const vy = top * frameHeight
  const vw = frameWidth * (1 - left - right)
  const vh = frameHeight * (1 - top - bottom)

  const scale = Math.min(vw / frameWidth, vh / frameHeight)
  const contentW = frameWidth * scale
  const contentH = frameHeight * scale
  const offsetX = vx + (vw - contentW) / 2
  const offsetY = vy + (vh - contentH) / 2

  return { scale, offsetX, offsetY }
}

/** Apply a fractional drag delta (in frame fractions) for a handle and return
 *  the updated, clamped insets. Dragging a left handle right (+dx) increases
 *  the left inset; dragging a right handle left (-dx) increases the right
 *  inset; vertical analogous. */
export function dragToInsets(
  handle: CalibrationHandle,
  delta: { dx: number; dy: number },
  current: CalibrationInsets,
): CalibrationInsets {
  const next = { ...current }
  const touchesLeft = handle === "left" || handle === "top-left" || handle === "bottom-left"
  const touchesRight = handle === "right" || handle === "top-right" || handle === "bottom-right"
  const touchesTop = handle === "top" || handle === "top-left" || handle === "top-right"
  const touchesBottom = handle === "bottom" || handle === "bottom-left" || handle === "bottom-right"

  if (touchesLeft) next.left = current.left + delta.dx
  if (touchesRight) next.right = current.right - delta.dx
  if (touchesTop) next.top = current.top + delta.dy
  if (touchesBottom) next.bottom = current.bottom - delta.dy

  return clampInsets(next)
}

/** Translate the whole safe-area rectangle by a fractional delta, preserving
 *  its width and height. Lets the operator reposition a shrunk guide (e.g.
 *  nudge it toward the center) without resizing. The translation is clamped so
 *  the rectangle never leaves the frame: moving right is bounded by the
 *  current right inset, moving left by the current left inset (analogous
 *  vertically). */
export function moveInsets(
  delta: { dx: number; dy: number },
  current: CalibrationInsets,
): CalibrationInsets {
  // Available travel before a side hits the frame edge (inset reaches 0).
  const dx = clamp(delta.dx, -current.left, current.right)
  const dy = clamp(delta.dy, -current.top, current.bottom)
  return {
    left: current.left + dx,
    right: current.right - dx,
    top: current.top + dy,
    bottom: current.bottom - dy,
  }
}
