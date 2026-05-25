import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { useSongStore } from "@/stores"
import { onlineHitImportId, type OnlinePreview } from "@/stores/song-store"
import type { OnlineHit, SongStanza } from "@/types"

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: OnlinePreview }

export function OnlineSongPreviewDrawer({
  hit,
  onClose,
  onImported,
}: {
  hit: OnlineHit | null
  onClose: () => void
  onImported: (songId: string) => void
}) {
  const previewOnlineHit = useSongStore((s) => s.previewOnlineHit)
  const geniusImport = useSongStore((s) => s.geniusImport)
  const lrclibImport = useSongStore((s) => s.lrclibImport)
  const existing = useSongStore((s) =>
    hit ? s.songs.find((x) => x.id === onlineHitImportId(hit)) : undefined,
  )

  const [state, setState] = useState<PreviewState>({ status: "loading" })
  const [importing, setImporting] = useState(false)
  const cache = useRef<Map<string, OnlinePreview>>(new Map())

  useEffect(() => {
    if (!hit) return
    const key = onlineHitImportId(hit)
    const cached = cache.current.get(key)
    if (cached) {
      setState({ status: "ready", preview: cached })
      return
    }
    setState({ status: "loading" })
    let cancelled = false
    previewOnlineHit(hit)
      .then((preview) => {
        if (cancelled) return
        cache.current.set(key, preview)
        setState({ status: "ready", preview })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Preview failed.",
        })
      })
    return () => {
      cancelled = true
    }
  }, [hit, previewOnlineHit])

  if (!hit) return null

  const alreadyImported = Boolean(existing)
  const importId = onlineHitImportId(hit)

  async function handleImport() {
    if (!hit) return
    setImporting(true)
    try {
      const song = hit.provider === "genius"
        ? await geniusImport(hit.hit)
        : await lrclibImport(hit.hit)
      toast.success(`Imported "${song.title}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.")
    } finally {
      setImporting(false)
    }
  }

  function handleOpenInLibrary() {
    onImported(importId)
    onClose()
  }

  const titleText = state.status === "ready" ? state.preview.title : hit.title
  const authorText = state.status === "ready" ? state.preview.author : hit.artist

  return (
    <Drawer open={!!hit} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="left-1/2 right-auto max-h-[55vh] w-full max-w-2xl -translate-x-1/2">
        <DrawerHeader>
          <DrawerTitle>
            <span className="mr-2 inline-flex align-middle">
              <ProviderTag provider={hit.provider} />
            </span>
            {titleText}
          </DrawerTitle>
          <DrawerDescription>{authorText}</DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-2">
          {state.status === "loading" && (
            <PreviewSkeleton />
          )}
          {state.status === "error" && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-500">
              {state.message}
            </div>
          )}
          {state.status === "ready" && (
            <>
              {state.preview.stanzas.map((stanza, idx) => (
                <StanzaBlock key={stanza.id} stanza={stanza} label={`V${idx + 1}`} />
              ))}
              {state.preview.chorus && (
                <StanzaBlock stanza={state.preview.chorus} label="CH" isChorus />
              )}
            </>
          )}
        </div>

        <DrawerFooter>
          {alreadyImported ? (
            <Button variant="default" onClick={handleOpenInLibrary}>
              Open in library
            </Button>
          ) : (
            <Button
              variant="default"
              onClick={handleImport}
              disabled={importing || state.status !== "ready"}
            >
              {importing ? "Importing…" : "Import"}
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function StanzaBlock({
  stanza,
  label,
  isChorus = false,
}: {
  stanza: SongStanza
  label: string
  isChorus?: boolean
}) {
  return (
    <div
      className={
        isChorus
          ? "rounded-md border border-primary/30 bg-primary/5 p-3"
          : "rounded-md border border-border bg-background p-3"
      }
    >
      <div className="mb-2">
        <span
          className={
            isChorus
              ? "text-xs font-semibold uppercase tracking-wide text-primary"
              : "text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          }
        >
          {label}
        </span>
      </div>
      <div className="space-y-0.5 text-sm leading-relaxed">
        {stanza.lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  )
}

function PreviewSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-md border border-border bg-background p-3">
          <div className="h-2 w-8 animate-pulse rounded bg-muted" />
          <div className="space-y-1.5">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
            <div className="h-3 w-9/12 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ProviderTag({ provider }: { provider: "genius" | "lrclib" }) {
  if (provider === "lrclib") {
    return (
      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
        LRC
      </span>
    )
  }
  return (
    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-600 dark:text-amber-400">
      Gen
    </span>
  )
}
