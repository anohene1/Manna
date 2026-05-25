import { useEffect, useMemo, useState } from "react"
import { invoke, convertFileSrc } from "@tauri-apps/api/core"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { SearchIcon, FolderIcon, PlayIcon, PlusIcon, CalendarPlusIcon, ImageIcon, UploadIcon, XIcon, Trash2Icon } from "lucide-react"
import { ask } from "@tauri-apps/plugin-dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PanelHeader } from "@/components/ui/panel-header"
import { cn } from "@/lib/utils"
import { useSettingsStore, useQueueStore } from "@/stores"
import { persistLocalImageFolder } from "@/stores/settings-store"
import { useServicePlan } from "@/hooks/use-service-plan"

type Tab = "local" | "online"
type Provider = "pexels" | "unsplash" | "local"

interface ImageHit {
  id: string
  url: string
  thumbnailUrl: string
  label: string
  provider: Provider
  photographer: string | null
  photographerUrl: string | null
  width: number
  height: number
  /** Raw filesystem path for local images; used when deleting. */
  localPath?: string
  /**
   * Containing folder used as the validation root for `validate_local_image`.
   * For folder-browse hits this equals `localImageFolder`. For single-file
   * picks via the OS dialog it's the parent directory of the picked file —
   * the user already consented via the dialog, so the file's own parent is
   * the natural validation root.
   */
  validationFolder?: string
}

export function ImagesPanel() {
  const [tab, setTab] = useState<Tab>("local")
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<ImageHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pexelsKey = useSettingsStore((s) => s.pexelsApiKey)
  const unsplashKey = useSettingsStore((s) => s.unsplashApiKey)
  const localFolder = useSettingsStore((s) => s.localImageFolder)

  const presentImageLive = useQueueStore((s) => s.presentImageLive)
  const enqueueImage = useQueueStore((s) => s.enqueueImage)
  const { addItem: addPlanItem } = useServicePlan()

  const search = async () => {
    setError(null)
    setLoading(true)
    try {
      if (tab === "online") {
        // Run Pexels + Unsplash in parallel, merge results. Interleave so both
        // providers are visible near the top.
        const calls: Array<Promise<ImageHit[]>> = []
        if (pexelsKey) {
          calls.push(
            invoke<ImageHit[]>("search_pexels", {
              apiKey: pexelsKey,
              query,
              page: 1,
            }).catch(() => []),
          )
        }
        if (unsplashKey) {
          calls.push(
            invoke<ImageHit[]>("search_unsplash", {
              apiKey: unsplashKey,
              query,
              page: 1,
            }).catch(() => []),
          )
        }
        if (calls.length === 0) {
          setHits([])
          setError("Add a Pexels or Unsplash key in Settings → API Keys.")
          return
        }
        const [a, b] = await Promise.all([calls[0], calls[1] ?? Promise.resolve([])])
        const merged: ImageHit[] = []
        const len = Math.max(a.length, b.length)
        for (let i = 0; i < len; i++) {
          if (a[i]) merged.push(a[i])
          if (b[i]) merged.push(b[i])
        }
        setHits(merged)
      } else {
        const folder = localFolder
        if (!folder) {
          setHits([])
          return
        }
        const out = await invoke<ImageHit[]>("list_local_images", { folder })
        // Convert raw filesystem paths to Tauri `asset:` URLs so the webview
        // is allowed to fetch them (bypasses CSP on local files).
        const withAssetUrls: ImageHit[] = out.map((h) => ({
          ...h,
          localPath: h.url,
          url: convertFileSrc(h.url),
          thumbnailUrl: convertFileSrc(h.thumbnailUrl),
          validationFolder: folder,
        }))
        const q = query.trim().toLowerCase()
        setHits(q ? withAssetUrls.filter((h) => h.label.toLowerCase().includes(q)) : withAssetUrls)
      }
    } catch (e) {
      setError(typeof e === "string" ? e : e instanceof Error ? e.message : String(e))
      setHits([])
    } finally {
      setLoading(false)
    }
  }

  // Auto-refresh local folder on mount + when folder changes
  useEffect(() => {
    if (tab === "local") {
      void search()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, localFolder])

  // Debounced search for online tab
  useEffect(() => {
    if (tab !== "online") return
    if (!query.trim()) return
    const t = setTimeout(() => void search(), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tab])

  const placeholder = useMemo(() => {
    if (tab === "local") return "Filter local images…"
    return "Search images…"
  }, [tab])

  const pickFolder = async () => {
    const path = await openDialog({ directory: true, multiple: false })
    if (typeof path === "string") {
      await persistLocalImageFolder(path)
    }
  }

  const clearFolder = async () => {
    await persistLocalImageFolder(null)
    setHits([])
  }

  const pickSingleFile = async () => {
    const file = await openDialog({
      directory: false,
      multiple: false,
      filters: [
        {
          name: "Images",
          extensions: [
            "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff",
            "avif", "heic", "heif", "svg", "ico", "jfif", "apng",
          ],
        },
      ],
    })
    if (typeof file !== "string") return
    const name = file.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") ?? "Image"
    const parent = file.replace(/[/\\][^/\\]+$/, "")
    const assetUrl = convertFileSrc(file)
    const hit: ImageHit = {
      id: `local-pick-${Date.now()}`,
      url: assetUrl,
      thumbnailUrl: assetUrl,
      label: name,
      provider: "local",
      photographer: null,
      photographerUrl: null,
      width: 0,
      height: 0,
      localPath: file,
      validationFolder: parent || undefined,
    }
    // Prepend to current hits so the picked image surfaces immediately.
    setHits((prev) => [hit, ...prev.filter((h) => h.url !== hit.url)])
  }

  const resolveBroadcastUrl = async (hit: ImageHit): Promise<string> => {
    // Local images: broadcast window can't reliably fetch asset:// URLs from
    // a sibling webview, so embed the bytes as a data URL the projector renders directly.
    const folder = hit.validationFolder ?? localFolder
    if (hit.provider === "local" && hit.localPath && folder) {
      try {
        return await invoke<string>("read_local_image_data_url", {
          path: hit.localPath,
          folder,
        })
      } catch (e) {
        console.error("[images] data-url read failed", e)
        return hit.url
      }
    }
    return hit.url
  }

  const onGoLive = async (hit: ImageHit) => {
    const url = await resolveBroadcastUrl(hit)
    presentImageLive({
      url,
      label: hit.label,
      thumbnailUrl: hit.thumbnailUrl,
      provider: hit.provider,
    })
  }

  const onEnqueue = async (hit: ImageHit) => {
    const url = await resolveBroadcastUrl(hit)
    enqueueImage({
      url,
      label: hit.label,
      thumbnailUrl: hit.thumbnailUrl,
      provider: hit.provider,
    })
  }

  const onDelete = async (hit: ImageHit) => {
    const folder = hit.validationFolder ?? localFolder
    if (!hit.localPath || !folder) return
    const ok = await ask(`Delete "${hit.label}" from disk? This cannot be undone.`, {
      title: "Delete image",
      kind: "warning",
    })
    if (!ok) return
    try {
      await invoke("delete_local_image", {
        path: hit.localPath,
        folder,
      })
      setHits((prev) => prev.filter((h) => h.id !== hit.id))
    } catch (e) {
      setError(typeof e === "string" ? e : e instanceof Error ? e.message : String(e))
    }
  }

  const onAddToPlan = async (hit: ImageHit) => {
    const url = await resolveBroadcastUrl(hit)
    await addPlanItem("blank", {
      type: "blank",
      showLogo: false,
      imageUrl: url,
      imageLabel: hit.label,
    })
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Images" />

      <div className="flex items-center gap-2 border-b border-border/60 px-2 py-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search()
            }}
            placeholder={placeholder}
            className="h-7 pl-7 text-xs"
          />
        </div>
        {tab === "local" && (
          <>
            <Button size="sm" variant="outline" onClick={pickSingleFile} className="shrink-0 gap-1 text-xs" title="Pick a single image">
              <UploadIcon className="size-3" />
              File
            </Button>
            <Button size="sm" variant="outline" onClick={pickFolder} className="shrink-0 gap-1 text-xs" title={localFolder ? "Change folder" : "Pick folder"}>
              <FolderIcon className="size-3" />
              Folder
            </Button>
          </>
        )}
      </div>

      <div className="flex gap-1 border-b border-border/40 px-2 py-1 text-[11px]">
        {(["local", "online"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded px-2 py-1 capitalize transition-colors",
              tab === t
                ? "bg-muted font-semibold text-foreground"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "local" && localFolder && (
        <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
          <FolderIcon className="size-2.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={localFolder}>
            {localFolder}
          </span>
          <button
            onClick={clearFolder}
            className="shrink-0 rounded p-0.5 hover:bg-destructive/20 hover:text-destructive"
            title="Clear folder"
          >
            <XIcon className="size-2.5" />
          </button>
        </div>
      )}

      {tab === "local" && !localFolder && hits.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-xs text-muted-foreground">
          <FolderIcon className="size-8 text-muted-foreground/40" />
          <p>Pick a folder or a single image to start.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={pickSingleFile}>
              Choose file
            </Button>
            <Button size="sm" variant="outline" onClick={pickFolder}>
              Choose folder
            </Button>
          </div>
        </div>
      )}

      {tab === "online" && !pexelsKey && !unsplashKey && (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
          <ImageIcon className="size-7 text-muted-foreground/40" />
          <p>
            Add a Pexels or Unsplash API key in Settings → API Keys to search
            online.
          </p>
        </div>
      )}

      {error && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-[10px] text-destructive">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {loading && hits.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">Searching…</p>
        ) : hits.length === 0 ? (
          tab === "online" && query.trim() && !error ? (
            <p className="p-4 text-center text-xs text-muted-foreground">No matches.</p>
          ) : null
        ) : (
          <ul className="grid grid-cols-2 gap-1.5">
            {hits.map((hit) => (
              <ImageTile
                key={hit.id}
                hit={hit}
                onGoLive={() => void onGoLive(hit)}
                onEnqueue={() => void onEnqueue(hit)}
                onAddToPlan={() => void onAddToPlan(hit)}
                onDelete={hit.provider === "local" && hit.localPath ? () => void onDelete(hit) : undefined}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ImageTile({
  hit,
  onGoLive,
  onEnqueue,
  onAddToPlan,
  onDelete,
}: {
  hit: ImageHit
  onGoLive: () => void
  onEnqueue: () => void
  onAddToPlan: () => void
  onDelete?: () => void
}) {
  return (
    <li className="group relative overflow-hidden rounded bg-muted/30 ring-1 ring-border/40">
      <div className="aspect-square overflow-hidden">
        <img
          src={hit.thumbnailUrl}
          alt={hit.label}
          loading="lazy"
          className="size-full object-cover"
        />
      </div>
      <div className="absolute right-1 top-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="rounded bg-black/55 px-1 py-px text-[7px] font-semibold uppercase tracking-wide text-white">
          {hit.provider}
        </span>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="rounded bg-destructive/85 p-0.5 text-white hover:bg-destructive"
            title="Delete from disk"
          >
            <Trash2Icon className="size-2.5" />
          </button>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/85 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex gap-1">
          <Button
            size="xs"
            variant="default"
            onClick={onGoLive}
            className="h-6 flex-1 gap-1 px-1 text-[9px]"
            title="Broadcast immediately"
          >
            <PlayIcon className="size-2.5" />
            Live
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={onEnqueue}
            className="h-6 gap-1 px-1.5 text-[9px]"
            title="Add to queue"
          >
            <PlusIcon className="size-2.5" />
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={onAddToPlan}
            className="h-6 gap-1 px-1.5 text-[9px]"
            title="Add to plan"
          >
            <CalendarPlusIcon className="size-2.5" />
          </Button>
        </div>
        {hit.photographer && (
          <a
            href={hit.photographerUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="truncate text-[8px] text-white/60 hover:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            {hit.photographer}
          </a>
        )}
      </div>
    </li>
  )
}
