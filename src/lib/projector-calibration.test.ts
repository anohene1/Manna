import { describe, it, expect } from "vitest"
import {
  insetsToTransform,
  clampInsets,
  dragToInsets,
  moveInsets,
  IDENTITY_INSETS,
} from "./projector-calibration"

const W = 1920
const H = 1080

describe("insetsToTransform", () => {
  it("returns identity for zero insets", () => {
    expect(insetsToTransform(IDENTITY_INSETS, W, H)).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    })
  })

  it("symmetric insets shrink and center", () => {
    const t = insetsToTransform({ top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 }, W, H)
    expect(t.scale).toBeCloseTo(0.8, 5)
    expect(t.offsetX).toBeCloseTo(0.1 * W, 3)
    expect(t.offsetY).toBeCloseTo(0.1 * H, 3)
  })

  it("aspect-mismatched rect letterboxes (scale = min, centered in the gap)", () => {
    const t = insetsToTransform({ top: 0, right: 0.25, bottom: 0, left: 0.25 }, W, H)
    const vw = W * 0.5
    expect(t.scale).toBeCloseTo(vw / W, 5)
    expect(t.offsetX).toBeCloseTo(0.25 * W, 3)
    expect(t.offsetY).toBeCloseTo((H - H * 0.5) / 2, 3)
  })
})

describe("clampInsets", () => {
  it("clamps each side to [0, 0.4]", () => {
    expect(clampInsets({ top: -0.2, right: 0.9, bottom: 0.4, left: 0.1 })).toEqual({
      top: 0,
      right: 0.4,
      bottom: 0.4,
      left: 0.1,
    })
  })

  it("prevents opposite sides summing past 0.8", () => {
    const c = clampInsets({ top: 0.4, right: 0, bottom: 0.4, left: 0 })
    expect(c.top + c.bottom).toBeLessThanOrEqual(0.8 + 1e-9)
  })
})

describe("dragToInsets", () => {
  it("dragging the left edge right increases left inset", () => {
    const next = dragToInsets("left", { dx: 0.1, dy: 0 }, IDENTITY_INSETS)
    expect(next.left).toBeCloseTo(0.1, 5)
    expect(next.right).toBe(0)
    expect(next.top).toBe(0)
    expect(next.bottom).toBe(0)
  })

  it("dragging the bottom-right corner inward increases right and bottom", () => {
    const next = dragToInsets("bottom-right", { dx: -0.1, dy: -0.1 }, IDENTITY_INSETS)
    expect(next.right).toBeCloseTo(0.1, 5)
    expect(next.bottom).toBeCloseTo(0.1, 5)
    expect(next.left).toBe(0)
    expect(next.top).toBe(0)
  })

  it("result is always clamped", () => {
    const next = dragToInsets("left", { dx: 5, dy: 0 }, IDENTITY_INSETS)
    expect(next.left).toBeLessThanOrEqual(0.4)
  })
})

describe("moveInsets", () => {
  const centered = { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 }

  it("translates while preserving width and height", () => {
    const next = moveInsets({ dx: 0.05, dy: 0.05 }, centered)
    expect(next.left).toBeCloseTo(0.15, 5)
    expect(next.right).toBeCloseTo(0.05, 5)
    expect(next.top).toBeCloseTo(0.15, 5)
    expect(next.bottom).toBeCloseTo(0.05, 5)
    // width = 1 - left - right unchanged at 0.8
    expect(1 - next.left - next.right).toBeCloseTo(0.8, 5)
    expect(1 - next.top - next.bottom).toBeCloseTo(0.8, 5)
  })

  it("clamps so the rect can't leave the frame (move right)", () => {
    // right inset is only 0.1, so dx is capped at 0.1
    const next = moveInsets({ dx: 0.5, dy: 0 }, centered)
    expect(next.right).toBeCloseTo(0, 5)
    expect(next.left).toBeCloseTo(0.2, 5)
    expect(1 - next.left - next.right).toBeCloseTo(0.8, 5) // width preserved
  })

  it("clamps so the rect can't leave the frame (move up)", () => {
    const next = moveInsets({ dx: 0, dy: -0.5 }, centered)
    expect(next.top).toBeCloseTo(0, 5)
    expect(next.bottom).toBeCloseTo(0.2, 5)
  })

  it("full-frame rect can't move (no travel)", () => {
    const next = moveInsets({ dx: 0.2, dy: 0.2 }, IDENTITY_INSETS)
    expect(next).toEqual(IDENTITY_INSETS)
  })
})
