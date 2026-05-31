import { describe, it, expect, vi } from "vitest"

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
}))

import { resolveBrandAsset, resolveChurchName, BRAND_DEFAULTS } from "./brand"

describe("resolveBrandAsset", () => {
  it("returns the bundled default when path is null", () => {
    expect(resolveBrandAsset("logo", null)).toBe(BRAND_DEFAULTS.logo)
    expect(resolveBrandAsset("momo", null)).toBe(BRAND_DEFAULTS.momo)
    expect(resolveBrandAsset("jesus", null)).toBe(BRAND_DEFAULTS.jesus)
  })

  it("returns a converted asset URL when a path is set", () => {
    const out = resolveBrandAsset("logo", "/data/brand/logo.png")
    expect(out).toContain("asset://localhost/")
    expect(out).toContain(encodeURIComponent("/data/brand/logo.png"))
  })
})

describe("resolveChurchName", () => {
  it("falls back to Manna when null/empty/whitespace", () => {
    expect(resolveChurchName(null)).toBe("Manna")
    expect(resolveChurchName("")).toBe("Manna")
    expect(resolveChurchName("   ")).toBe("Manna")
  })
  it("returns the trimmed name when set", () => {
    expect(resolveChurchName("  Grace Chapel  ")).toBe("Grace Chapel")
  })
})
