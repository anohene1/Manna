import { invoke } from "@tauri-apps/api/core"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { useSettingsStore } from "@/stores"
import { persistBrandConfig } from "@/stores/settings-store"
import { resolveBrandAsset, type BrandAssetKind } from "@/lib/brand"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const IMAGE_EXTS = [
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff",
  "avif", "heic", "heif", "svg", "ico", "jfif", "apng",
]

const ASSET_ROWS: { kind: BrandAssetKind; label: string; field: "logoPath" | "blankImagePath" | "momoImagePath" | "jesusImagePath" }[] = [
  { kind: "logo", label: "App logo (sessions screen)", field: "logoPath" },
  { kind: "blank", label: "Blank-slide image (projector)", field: "blankImagePath" },
  { kind: "momo", label: "MoMo slide image", field: "momoImagePath" },
  { kind: "jesus", label: "Jesus slide image", field: "jesusImagePath" },
]

export function BrandingSection() {
  const brand = useSettingsStore((s) => s.brand)

  const pickAsset = async (kind: BrandAssetKind, field: typeof ASSET_ROWS[number]["field"]) => {
    const file = await openDialog({
      directory: false,
      multiple: false,
      filters: [{ name: "Images", extensions: IMAGE_EXTS }],
    })
    if (typeof file !== "string") return
    try {
      const stored = await invoke<string>("save_brand_asset", { kind, srcPath: file })
      await persistBrandConfig({ [field]: stored })
    } catch (e) {
      console.error("[branding] save failed", e)
    }
  }

  const resetAsset = async (kind: BrandAssetKind, field: typeof ASSET_ROWS[number]["field"]) => {
    try {
      await invoke("delete_brand_asset", { kind })
    } catch {
      /* ignore — file may already be gone */
    }
    await persistBrandConfig({ [field]: null })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Church name</label>
        <Input
          value={brand.churchName ?? ""}
          placeholder="Manna"
          onChange={(e) => void persistBrandConfig({ churchName: e.target.value || null })}
        />
        <p className="text-[10px] text-muted-foreground">
          Shown on the landing screen and window title. Blank uses the default.
        </p>
      </div>

      {ASSET_ROWS.map(({ kind, label, field }) => (
        <div key={kind} className="flex items-center gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-black/40">
            <img
              src={resolveBrandAsset(kind, brand[field])}
              alt={label}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{label}</div>
            <div className="truncate text-[10px] text-muted-foreground">
              {brand[field] ? brand[field] : "Using bundled default"}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => void pickAsset(kind, field)}>
              Change
            </Button>
            {brand[field] && (
              <Button size="sm" variant="ghost" onClick={() => void resetAsset(kind, field)}>
                Reset
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
