import { convertFileSrc } from "@tauri-apps/api/core"

// `logo`  = app/sessions logo (landing screen, window chrome).
// `blank` = projector blank-slide image (shown on the broadcast when idle).
// These are intentionally distinct assets with distinct defaults.
export type BrandAssetKind = "logo" | "blank" | "momo" | "jesus"

/** Bundled fallback assets (served from `public/`). Used when no override is set. */
export const BRAND_DEFAULTS: Record<BrandAssetKind, string> = {
  logo: "/ag-logo.png",
  blank: "/ag-bebu.png",
  momo: "/momo.png",
  jesus: "/JESUSs.png",
}

/** Resolve a brand asset to a usable URL: the override (as an `asset:` URL) if
 *  set, otherwise the bundled default. */
export function resolveBrandAsset(kind: BrandAssetKind, path: string | null): string {
  return path ? convertFileSrc(path) : BRAND_DEFAULTS[kind]
}

/** Church display name with a sensible fallback. */
export function resolveChurchName(name: string | null): string {
  const trimmed = name?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : "Manna"
}
