import { useState, useMemo } from "react"
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  CommandGroup,
} from "@/components/ui/command"
import { useSongStore } from "@/stores"
import { useServicePlan } from "@/hooks/use-service-plan"
import { HYMNAL_BADGES, isHymnalSource } from "@/types"
import type { Song } from "@/types"

interface AddSongDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function badge(song: Song): string {
  if (isHymnalSource(song.source)) return HYMNAL_BADGES[song.source]
  return song.source.toUpperCase()
}

function songMatches(song: Song, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  if (song.title.toLowerCase().includes(lower)) return true
  if (song.author && song.author.toLowerCase().includes(lower)) return true
  if (song.number != null && String(song.number).includes(lower)) return true
  return false
}

export function AddSongDialog({ open, onOpenChange }: AddSongDialogProps) {
  const { addItem } = useServicePlan()
  const songs = useSongStore((s) => s.songs)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim()
    return songs.filter((s) => songMatches(s, q)).slice(0, 50)
  }, [songs, query])

  const handlePick = async (song: Song) => {
    await addItem("song", {
      type: "song",
      songId: song.id,
      autoChorus: song.autoChorus,
      lineMode: song.lineMode,
    })
    onOpenChange(false)
    setQuery("")
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add song to plan"
      description="Pick from your enabled hymnals."
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search by title, author, or number…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {songs.length === 0 && (
            <CommandEmpty>No songs available. Enable a hymnal in Settings.</CommandEmpty>
          )}
          {songs.length > 0 && filtered.length === 0 && (
            <CommandEmpty>No songs match “{query}”.</CommandEmpty>
          )}
          {filtered.length > 0 && (
            <CommandGroup heading={`${filtered.length} song${filtered.length === 1 ? "" : "s"}`}>
              {filtered.map((song) => (
                <CommandItem
                  key={song.id}
                  value={`${song.title} ${song.author ?? ""} ${song.number ?? ""}`}
                  onSelect={() => void handlePick(song)}
                  className="flex items-center gap-2"
                >
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase">
                    {badge(song)}
                    {song.number != null ? ` ${song.number}` : ""}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-xs font-semibold">{song.title}</span>
                    {song.author && (
                      <span className="text-[10px] text-muted-foreground">
                        {song.author}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
