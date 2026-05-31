import { useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { PanelHeader } from "@/components/ui/panel-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  PlayIcon,
  XIcon,
  ListIcon,
  SearchIcon,
  PlusIcon,
  BookOpenIcon,
  MusicIcon,
  ImageIcon,
  ChevronDownIcon,
} from "lucide-react"
import { useQueueStore, useBroadcastStore, useBibleStore, useSongStore } from "@/stores"
import { toVerseRenderData } from "@/hooks/use-broadcast"
import { bibleActions } from "@/hooks/use-bible"
import { songStanzaToRenderData } from "@/lib/song-to-render"
import type { QueueItem, Verse } from "@/types"

function QueueItemCard({
  item,
  index,
  isActive,
}: {
  item: QueueItem
  index: number
  isActive: boolean
}) {
  const handlePresent = () => {
    useQueueStore.getState().setActive(index)
    if (item.kind === "song-stanza") {
      const song = useSongStore.getState().getSong(item.songId)
      const render = songStanzaToRenderData(item, song)
      if (render) useBroadcastStore.getState().setPreviewVerse(render)
      useBroadcastStore.getState().goLive()
      return
    }
    if (item.kind === "image") {
      useBroadcastStore.getState().setFullscreenImage({ url: item.url, label: item.label })
      return
    }
    bibleActions.selectVerse(item.verse)
    const translation = useBibleStore.getState().translations
      .find(t => t.id === useBibleStore.getState().activeTranslationId)?.abbreviation ?? "KJV"
    const verseData = toVerseRenderData(item.verse, translation)
    useBroadcastStore.getState().setPreviewVerse(verseData)
    useBroadcastStore.getState().goLive()
  }

  const handlePreview = () => {
    useQueueStore.getState().setActive(index)
    if (item.kind === "song-stanza") {
      const song = useSongStore.getState().getSong(item.songId)
      const render = songStanzaToRenderData(item, song)
      if (render) useBroadcastStore.getState().setPreviewVerse(render)
      return
    }
    if (item.kind === "image") {
      // Preview = stage for go-live; reuse fullscreenImage for visual feedback
      useBroadcastStore.getState().setFullscreenImage({ url: item.url, label: item.label })
      return
    }
    bibleActions.selectVerse(item.verse)
    const translation = useBibleStore.getState().translations
      .find(t => t.id === useBibleStore.getState().activeTranslationId)?.abbreviation ?? "KJV"
    useBroadcastStore.getState().setPreviewVerse(toVerseRenderData(item.verse, translation))
  }

  const handleRemove = () => {
    useQueueStore.getState().removeItem(item.id)
  }

  return (
    <div
      onClick={handlePreview}
      onDoubleClick={handlePresent}
      className={cn(
        "group cursor-pointer rounded-lg px-2.5 py-2 transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-surface-elevated hover:bg-muted/50"
      )}
    >
      {/* Reference + verse snippet in one compact row */}
      <div className="flex items-start gap-2">
        <span className={cn("text-[9px] tabular-nums pt-0.5", isActive ? "text-primary-foreground/50" : "text-muted-foreground/50")}>
          {index + 1}
        </span>
        <span className={cn("shrink-0 pt-0.5", isActive ? "text-primary-foreground/70" : "text-muted-foreground/60")} aria-hidden>
          {item.kind === "verse" ? (
            <BookOpenIcon className="size-2.5" />
          ) : item.kind === "image" ? (
            <ImageIcon className="size-2.5" />
          ) : (
            <MusicIcon className="size-2.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <span className={cn("text-[11px] font-semibold", isActive ? "text-primary-foreground" : "text-foreground")}>
            {item.kind === "image" ? (item.label || "Image") : item.reference}
          </span>
          {item.kind === "verse" ? (
            <p className={cn(
              "line-clamp-1 font-serif text-[10px] leading-snug",
              isActive ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              {item.verse.text}
            </p>
          ) : item.kind === "image" ? (
            <div className="mt-1 flex items-center justify-center overflow-hidden rounded bg-black/40 ring-1 ring-border/40">
              <img
                src={item.thumbnailUrl ?? item.url}
                alt={item.label}
                className="max-h-32 w-auto max-w-full object-contain"
              />
            </div>
          ) : (
            <p className={cn(
              "whitespace-pre-line font-serif text-[13px] leading-relaxed",
              isActive ? "text-primary-foreground/85" : "text-foreground/80"
            )}>
              {item.text}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(
              "opacity-0 transition-opacity group-hover:opacity-100",
              isActive ? "text-primary-foreground hover:bg-primary-foreground/20" : "hover:text-primary"
            )}
            onClick={(e) => { e.stopPropagation(); handlePresent() }}
          >
            <PlayIcon className="size-2.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(
              "opacity-0 transition-opacity group-hover:opacity-100",
              isActive ? "text-primary-foreground hover:bg-primary-foreground/20" : "hover:text-destructive"
            )}
            onClick={(e) => { e.stopPropagation(); handleRemove() }}
          >
            <XIcon className="size-2.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

type QueueBlock =
  | { kind: "flat"; item: QueueItem; index: number }
  | {
      kind: "group"
      songId: string
      firstIndex: number
      items: { item: QueueItem; index: number }[]
    }

/**
 * Build an ordered list of blocks from the flat queue. Contiguous
 * song-stanza items sharing the same songId fold into a single group;
 * verses/images and song-stanzas that don't share a neighbour stay flat.
 */
function buildBlocks(items: QueueItem[]): QueueBlock[] {
  const blocks: QueueBlock[] = []
  let i = 0
  while (i < items.length) {
    const item = items[i]
    if (item.kind === "song-stanza") {
      const songId = item.songId
      const groupItems: { item: QueueItem; index: number }[] = []
      const firstIndex = i
      while (i < items.length) {
        const next = items[i]
        if (next.kind !== "song-stanza" || next.songId !== songId) break
        groupItems.push({ item: next, index: i })
        i++
      }
      if (groupItems.length > 1) {
        blocks.push({ kind: "group", songId, firstIndex, items: groupItems })
      } else {
        // Single stanza — don't bother grouping, render flat.
        blocks.push({ kind: "flat", item: groupItems[0].item, index: groupItems[0].index })
      }
    } else {
      blocks.push({ kind: "flat", item, index: i })
      i++
    }
  }
  return blocks
}

function QueueSongGroup({
  songId,
  firstIndex,
  items,
  collapsed,
  onToggle,
  activeIndex,
}: {
  songId: string
  firstIndex: number
  items: { item: QueueItem; index: number }[]
  collapsed: boolean
  onToggle: () => void
  activeIndex: number
}) {
  const songTitle = useSongStore((s) => s.songs.find((x) => x.id === songId)?.title ?? null)
  const activeChild = items.find((x) => x.index === activeIndex)
  const playedCount = activeChild ? activeChild.index - firstIndex + 1 : 0

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
          activeChild
            ? "border-red-500/40 bg-red-500/5 hover:bg-red-500/10"
            : "border-border bg-muted/30 hover:bg-muted/50",
        )}
      >
        <ChevronDownIcon
          className={cn("size-3 shrink-0 transition-transform", collapsed && "-rotate-90")}
        />
        <MusicIcon className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{songTitle ?? `Song ${songId}`}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {activeChild ? `${playedCount}/${items.length}` : `${items.length} stanzas`}
        </span>
        {activeChild && (
          <span className="shrink-0 text-[9px] font-semibold text-red-500">LIVE</span>
        )}
      </button>
      {!collapsed && (
        <div className="ml-2 flex flex-col gap-1 border-l border-border pl-2">
          {items.map(({ item, index }) => (
            <QueueItemCard
              key={item.id}
              item={item}
              index={index}
              isActive={index === activeIndex}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function QueuePanel() {
  const items = useQueueStore((s) => s.items)
  const activeIndex = useQueueStore((s) => s.activeIndex)
  const activeTranslationId = useBibleStore((s) => s.activeTranslationId)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Verse[]>([])
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set())

  const toggleCollapsed = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return
    try {
      const results = await invoke<Verse[]>("search_verses", {
        query: searchQuery.trim(),
        translationId: activeTranslationId,
        limit: 6,
      })
      setSearchResults(results)
    } catch {
      setSearchResults([])
    }
  }

  const addVerseToQueue = (verse: Verse) => {
    useQueueStore.getState().addItem({
      kind: "verse",
      id: crypto.randomUUID(),
      verse,
      reference: `${verse.book_name} ${verse.chapter}:${verse.verse}`,
      confidence: 1,
      source: "manual",
      added_at: Date.now(),
    })
    setSearchResults([])
    setSearchQuery("")
  }

  return (
    <div
      data-slot="queue-panel"
      className="flex h-full min-w-0 flex-col overflow-hidden bg-card"
    >
      <PanelHeader title="Queue">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{items.length}</Badge>
          {items.length > 0 && (
            <button
              onClick={() => useQueueStore.getState().clearQueue()}
              className="text-[0.625rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      </PanelHeader>

      {/* Quick add search */}
      <div className="flex shrink-0 gap-1 border-b border-border p-1.5">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Add verse..."
            className="h-7 pl-7 text-[11px]"
          />
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleSearch}>
          <PlusIcon className="size-3" />
        </Button>
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="shrink-0 border-b border-border bg-muted/20">
          <div className="max-h-32 overflow-y-auto">
            {searchResults.map((verse) => (
              <button
                key={verse.id}
                onClick={() => addVerseToQueue(verse)}
                className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className="shrink-0 text-[10px] font-semibold text-primary">
                  {verse.book_name} {verse.chapter}:{verse.verse}
                </span>
                <span className="line-clamp-1 font-serif text-[10px] text-muted-foreground">
                  {verse.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1.5 p-2">
          {items.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted/50">
                <ListIcon className="size-5 text-muted-foreground/60" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Queue is empty</p>
                <p className="text-[0.625rem] leading-relaxed text-muted-foreground/60">
                  Search above to add verses, or they'll appear here from detections during the service.
                </p>
              </div>
            </div>
          )}
          {buildBlocks(items).map((block) => {
            if (block.kind === "flat") {
              return (
                <QueueItemCard
                  key={block.item.id}
                  item={block.item}
                  index={block.index}
                  isActive={block.index === activeIndex}
                />
              )
            }
            const key = `${block.firstIndex}-${block.songId}`
            return (
              <QueueSongGroup
                key={key}
                songId={block.songId}
                firstIndex={block.firstIndex}
                items={block.items}
                collapsed={collapsedKeys.has(key)}
                onToggle={() => toggleCollapsed(key)}
                activeIndex={activeIndex}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
