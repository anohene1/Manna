import { useState, useEffect, useRef } from "react"
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  CommandGroup,
} from "@/components/ui/command"
import { bibleActions } from "@/hooks/use-bible"
import { useBibleStore } from "@/stores"
import { useServicePlan } from "@/hooks/use-service-plan"
import type { Verse } from "@/types"

interface AddVerseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SEARCH_DEBOUNCE_MS = 200

export function AddVerseDialog({ open, onOpenChange }: AddVerseDialogProps) {
  const { addItem } = useServicePlan()
  const translations = useBibleStore((s) => s.translations)
  const activeTranslationId = useBibleStore((s) => s.activeTranslationId)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Verse[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
      return
    }
  }, [open])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!open) return
    if (query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const verses = await bibleActions.searchVerses(query.trim(), 30)
        setResults(verses)
      } catch (e) {
        console.warn("[add-verse] search failed", e)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
  }, [query, open])

  const translation = translations.find((t) => t.id === activeTranslationId)
  const translationAbbr = translation?.abbreviation ?? "KJV"

  const handlePick = async (verse: Verse) => {
    const ref = `${verse.book_name} ${verse.chapter}:${verse.verse}`
    await addItem("verse", {
      type: "verse",
      verseRef: ref,
      translationId: verse.translation_id,
      verseText: verse.text,
      bookNumber: verse.book_number,
      chapter: verse.chapter,
      verse: verse.verse,
      bookName: verse.book_name,
    })
    onOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add verse to plan"
      description={`Search ${translationAbbr} by reference or text.`}
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search by phrase or reference (e.g. John 3:16)…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading && (
            <CommandEmpty>Searching…</CommandEmpty>
          )}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <CommandEmpty>No verses match “{query}”.</CommandEmpty>
          )}
          {!loading && query.trim().length < 2 && (
            <CommandEmpty>Type at least 2 characters.</CommandEmpty>
          )}
          {results.length > 0 && (
            <CommandGroup heading={`${translationAbbr} · ${results.length} result${results.length === 1 ? "" : "s"}`}>
              {results.map((v) => (
                <CommandItem
                  key={v.id}
                  value={`${v.book_name} ${v.chapter}:${v.verse} ${v.text}`}
                  onSelect={() => void handlePick(v)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="text-xs font-semibold">
                    {v.book_name} {v.chapter}:{v.verse}
                  </span>
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">
                    {v.text}
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
