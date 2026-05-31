import { useEffect, useMemo, useState } from "react"
import { invoke, convertFileSrc } from "@tauri-apps/api/core"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { SearchIcon, FolderIcon, PlayIcon, PlusIcon, CalendarPlusIcon, ImageIcon, UploadIcon, XIcon, Trash2Icon, DownloadIcon, CheckIcon } from "lucide-react"
import { ask } from "@tauri-apps/plugin-dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PanelHeader } from "@/components/ui/panel-header"
import { cn } from "@/lib/utils"
import { useSettingsStore, useQueueStore } from "@/stores"
import { persistLocalImageFolder } from "@/stores/settings-store"
import { useServicePlan } from "@/hooks/use-service-plan"

type Tab = "local" | "online"
type Provider = "pexels" | "unsplash" | "brave" | "local" | "library"

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

type OnlineFilter = "all" | "pexels" | "unsplash" | "brave"

export function ImagesPanel() {
  const [tab, setTab] = useState<Tab>("local")
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<ImageHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [onlineFilter, setOnlineFilter] = useState<OnlineFilter>("all")
  const [libraryDir, setLibraryDir] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    invoke<string>("library_dir_path").then(setLibraryDir).catch(() => setLibraryDir(null))
  }, [])

  const pexelsKey = useSettingsStore((s) => s.pexelsApiKey)
  const unsplashKey = useSettingsStore((s) => s.unsplashApiKey)
  const braveKey = useSettingsStore((s) => s.braveApiKey)
  const localFolder = useSettingsStore((s) => s.localImageFolder)

  const presentImageLive = useQueueStore((s) => s.presentImageLive)
  const enqueueImage = useQueueStore((s) => s.enqueueImage)
  const { addItem: addPlanItem } = useServicePlan()

  const search = async () => {
    setError(null)
    setLoading(true)
    try {
      if (tab === "online") {
        // Run any configured provider in parallel, interleave the results
        // round-robin so each source surfaces near the top of the grid.
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
        if (braveKey) {
          calls.push(
            invoke<ImageHit[]>("search_brave_images", {
              apiKey: braveKey,
              query,
            }).catch(() => []),
          )
        }
        if (calls.length === 0) {
          setHits([])
          setError("Add a Pexels, Unsplash, or Brave key in Settings → API Keys.")
          return
        }
        const results = await Promise.all(calls)
        const merged: ImageHit[] = []
        const len = Math.max(...results.map((r) => r.length))
        for (let i = 0; i < len; i++) {
          for (const r of results) {
            if (r[i]) merged.push(r[i])
          }
        }
        setHits(merged)
      } else {
        // Merge library (saved-from-online) + user folder hits. Library first
        // so freshly saved images surface near the top.
        const calls: Array<Promise<ImageHit[]>> = []
        calls.push(invoke<ImageHit[]>("list_library_images").catch(() => []))
        if (localFolder) {
          calls.push(invoke<ImageHit[]>("list_local_images", { folder: localFolder }).catch(() => []))
        }
        const [libHits, folderHits = []] = await Promise.all(calls)

        const libDir = libraryDir
        const withAssetUrls: ImageHit[] = [
          ...libHits.map((h) => ({
            ...h,
            localPath: h.url,
            url: convertFileSrc(h.url),
            thumbnailUrl: convertFileSrc(h.thumbnailUrl),
            validationFolder: libDir ?? undefined,
            provider: "library" as Provider,
          })),
          ...folderHits.map((h) => ({
            ...h,
            localPath: h.url,
            url: convertFileSrc(h.url),
            thumbnailUrl: convertFileSrc(h.thumbnailUrl),
            validationFolder: localFolder ?? undefined,
          })),
        ]

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
    // Copy the picked file into the managed library so it persists across
    // reloads (previously the transient asset URL was lost on reload). It then
    // surfaces via list_library_images with a proper asset URL + validation
    // folder, so just refresh the local tab.
    try {
      await invoke("import_library_image", { srcPath: file })
    } catch (e) {
      setError(typeof e === "string" ? e : e instanceof Error ? e.message : "Failed to import image")
      return
    }
    await search()
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

  const onDownload = async (hit: ImageHit) => {
    if (hit.provider === "local" || hit.provider === "library") return
    try {
      await invoke<ImageHit>("save_image_to_library", {
        url: hit.url,
        label: hit.label || `Image from ${hit.provider}`,
        provider: hit.provider,
        photographer: hit.photographer,
        photographerUrl: hit.photographerUrl,
      })
      setSavedIds((prev) => new Set(prev).add(hit.id))
    } catch (e) {
      setError(typeof e === "string" ? e : e instanceof Error ? e.message : String(e))
    }
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
      if (hit.provider === "library") {
        await invoke("delete_library_image", { path: hit.localPath })
      } else {
        await invoke("delete_local_image", {
          path: hit.localPath,
          folder,
        })
      }
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

      {tab === "online" && !pexelsKey && !unsplashKey && !braveKey && (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
          <ImageIcon className="size-7 text-muted-foreground/40" />
          <p>
            Add a Pexels, Unsplash, or Brave API key in Settings → API Keys to
            search online.
          </p>
        </div>
      )}

      {tab === "online" && (pexelsKey || unsplashKey || braveKey) && hits.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border/40 px-2 py-1.5">
          {(() => {
            const counts: Record<OnlineFilter, number> = {
              all: hits.length,
              pexels: hits.filter((h) => h.provider === "pexels").length,
              unsplash: hits.filter((h) => h.provider === "unsplash").length,
              brave: hits.filter((h) => h.provider === "brave").length,
            }
            const chips: { id: OnlineFilter; label: string; show: boolean }[] = [
              { id: "all", label: "All", show: true },
              { id: "pexels", label: "Pexels", show: !!pexelsKey && counts.pexels > 0 },
              { id: "unsplash", label: "Unsplash", show: !!unsplashKey && counts.unsplash > 0 },
              { id: "brave", label: "Brave", show: !!braveKey && counts.brave > 0 },
            ]
            return chips
              .filter((c) => c.show)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => setOnlineFilter(c.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                    onlineFilter === c.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  {c.label}
                  <span
                    className={cn(
                      "rounded-full px-1 text-[9px] tabular-nums",
                      onlineFilter === c.id ? "bg-primary-foreground/20" : "bg-foreground/10",
                    )}
                  >
                    {counts[c.id]}
                  </span>
                </button>
              ))
          })()}
        </div>
      )}

      {error && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-[10px] text-destructive">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {(() => {
          const visibleHits =
            tab === "online" && onlineFilter !== "all"
              ? hits.filter((h) => h.provider === onlineFilter)
              : hits
          if (loading && visibleHits.length === 0) {
            return <p className="p-4 text-center text-xs text-muted-foreground">Searching…</p>
          }
          if (visibleHits.length === 0) {
            if (tab === "online" && query.trim() && !error) {
              return <p className="p-4 text-center text-xs text-muted-foreground">No matches.</p>
            }
            return null
          }
          return (
            <ul className="grid grid-cols-2 gap-1.5">
              {visibleHits.map((hit) => (
                <ImageTile
                  key={hit.id}
                  hit={hit}
                  saved={savedIds.has(hit.id)}
                  onGoLive={() => void onGoLive(hit)}
                  onEnqueue={() => void onEnqueue(hit)}
                  onAddToPlan={() => void onAddToPlan(hit)}
                  onDownload={
                    hit.provider === "pexels" || hit.provider === "unsplash" || hit.provider === "brave"
                      ? () => void onDownload(hit)
                      : undefined
                  }
                  onDelete={
                    (hit.provider === "local" || hit.provider === "library") && hit.localPath
                      ? () => void onDelete(hit)
                      : undefined
                  }
                />
              ))}
            </ul>
          )
        })()}
      </div>
    </div>
  )
}

function ImageTile({
  hit,
  saved,
  onGoLive,
  onEnqueue,
  onAddToPlan,
  onDownload,
  onDelete,
}: {
  hit: ImageHit
  saved?: boolean
  onGoLive: () => void
  onEnqueue: () => void
  onAddToPlan: () => void
  onDownload?: () => void
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
        {onDownload && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!saved) onDownload()
            }}
            disabled={saved}
            className={cn(
              "rounded p-0.5 text-white transition-colors",
              saved
                ? "bg-emerald-600/85 cursor-default"
                : "bg-black/70 hover:bg-primary",
            )}
            title={saved ? "Saved to library" : "Save to library"}
          >
            {saved ? <CheckIcon className="size-2.5" /> : <DownloadIcon className="size-2.5" />}
          </button>
        )}
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
