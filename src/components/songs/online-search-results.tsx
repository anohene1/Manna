import { useEffect, useMemo, useState } from "react"
import { CheckIcon, MusicIcon } from "lucide-react"
import { useSongStore } from "@/stores"
import { onlineHitImportId } from "@/stores/song-store"
import { OnlineSongPreviewDrawer } from "@/components/songs/online-song-preview-drawer"
import { cn } from "@/lib/utils"
import type { OnlineHit, Song } from "@/types"

export function OnlineSearchResults({
  query,
  onImported,
}: {
  query: string
  onImported: (songId: string) => void
}) {
  const [hits, setHits] = useState<OnlineHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedHit, setSelectedHit] = useState<OnlineHit | null>(null)
  const songs = useSongStore((s) => s.songs)
  const importedIds = useMemo(() => new Set(songs.map((song) => song.id)), [songs])

  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const timer = setTimeout(async () => {
      try {
        const results = await useSongStore.getState().onlineSearch(query)
        if (cancelled) return
        setHits(results)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Search failed.")
        setHits([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const importedOnline = useMemo(
    () => songs.filter((s) => s.source === "genius" || s.source === "lrclib"),
    [songs],
  )

  if (!query.trim()) {
    if (importedOnline.length === 0) {
      return (
        <div className="p-4 text-xs text-muted-foreground">
          Type in the search box above to look up songs online.
        </div>
      )
    }
    return (
      <>
        <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Imported · {importedOnline.length}
        </div>
        <ul className="divide-y divide-border/40">
          {importedOnline.map((song) => (
            <ImportedRow key={song.id} song={song} onOpen={() => onImported(song.id)} />
          ))}
        </ul>
        <div className="p-3 text-[11px] text-muted-foreground">
          Search above to find more from Genius / LRCLIB.
        </div>
      </>
    )
  }

  if (loading) {
    return <div className="p-4 text-xs text-muted-foreground">Searching…</div>
  }

  if (error) {
    return <div className="p-4 text-xs text-red-500">{error}</div>
  }

  if (hits.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No results. Try different words or paste lyrics manually.
      </div>
    )
  }

  return (
    <>
      <ul className="divide-y divide-border/40">
        {hits.map((item) => {
          const isImported = importedIds.has(onlineHitImportId(item))
          return (
            <li key={`${item.provider}-${item.key}`}>
              <button
                type="button"
                onClick={() => setSelectedHit(item)}
                className={cn(
                  "flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/40",
                  isImported && "bg-muted/20",
                )}
              >
                <ProviderBadge item={item} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.artist}</div>
                </div>
                {isImported && (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckIcon className="size-3" />
                    Imported
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <OnlineSongPreviewDrawer
        hit={selectedHit}
        onClose={() => setSelectedHit(null)}
        onImported={onImported}
      />
    </>
  )
}

function ImportedRow({ song, onOpen }: { song: Song; onOpen: () => void }) {
  const isLrclib = song.source === "lrclib"
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/40"
      >
        {isLrclib ? (
          <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
            LRC
          </span>
        ) : (
          <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-600 dark:text-amber-400">
            Gen
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{song.title}</div>
          {song.author && (
            <div className="truncate text-xs text-muted-foreground">{song.author}</div>
          )}
        </div>
        <MusicIcon className="size-3 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

function ProviderBadge({ item }: { item: OnlineHit }) {
  if (item.provider === "lrclib") {
    return (
      <div className="flex shrink-0 flex-col items-start gap-0.5">
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
          LRC
        </span>
        {item.hit.hasSynced && (
          <span className="text-[9px] font-medium uppercase text-muted-foreground">synced</span>
        )}
      </div>
    )
  }
  return (
    <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-600 dark:text-amber-400">
      Gen
    </span>
  )
}
