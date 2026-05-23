import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useSongStore } from "@/stores"
import type { OnlineHit } from "@/types"

export function OnlineSearchResults({ query }: { query: string }) {
  const [hits, setHits] = useState<OnlineHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importingKey, setImportingKey] = useState<string | null>(null)

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

  async function handleImport(item: OnlineHit) {
    setImportingKey(`${item.provider}-${item.key}`)
    try {
      const store = useSongStore.getState()
      if (item.provider === "genius") {
        await store.geniusImport(item.hit)
      } else {
        await store.lrclibImport(item.hit)
      }
      toast.success(`Imported "${item.title}"`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed."
      toast.error(message)
    } finally {
      setImportingKey(null)
    }
  }

  if (!query.trim()) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Type in the search box above to look up songs online.
      </div>
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
    <ul className="divide-y divide-border/40">
      {hits.map((item) => {
        const importing = importingKey === `${item.provider}-${item.key}`
        return (
          <li key={`${item.provider}-${item.key}`} className="flex items-center gap-3 p-3">
            <ProviderBadge item={item} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{item.title}</div>
              <div className="truncate text-xs text-muted-foreground">{item.artist}</div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleImport(item)}
              disabled={importing}
            >
              {importing ? "Importing…" : "Import"}
            </Button>
          </li>
        )
      })}
    </ul>
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
