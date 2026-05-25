import { useState } from "react"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useSongStore } from "@/stores"
import type { Song, SongStanza } from "@/types"

function parseStanzas(body: string): SongStanza[] {
  const blocks = body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)

  return blocks.map((block, idx) => {
    const lines = block
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    return {
      id: `v${idx + 1}`,
      kind: "verse",
      lines,
    }
  })
}

export function PasteLyricsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setTitle("")
    setAuthor("")
    setBody("")
    setError(null)
    setSaving(false)
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  const trimmedTitle = title.trim()
  const trimmedBody = body.trim()
  const canSave = trimmedTitle.length > 0 && trimmedBody.length > 0 && !saving

  const handleSave = async () => {
    setError(null)
    const stanzas = parseStanzas(body)
    if (stanzas.length === 0) {
      setError("Separate stanzas with blank lines")
      return
    }

    const song: Song = {
      id: `custom-${crypto.randomUUID()}`,
      source: "custom",
      number: null,
      title: trimmedTitle,
      author: author.trim() || null,
      stanzas,
      chorus: null,
      autoChorus: false,
      lineMode: "stanza-pair",
      tune: null,
      meter: null,
      scriptureRef: null,
      category: null,
    }

    setSaving(true)
    try {
      await useSongStore.getState().saveSong(song)
      reset()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save song")
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="left-1/2 right-auto max-h-[85vh] w-full max-w-2xl -translate-x-1/2">
        <DrawerHeader>
          <DrawerTitle>New Song</DrawerTitle>
          <DrawerDescription>
            Paste lyrics below. Separate stanzas with blank lines.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="paste-lyrics-title"
              className="text-sm font-medium text-foreground"
            >
              Title
            </label>
            <Input
              id="paste-lyrics-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Song title"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="paste-lyrics-author"
              className="text-sm font-medium text-foreground"
            >
              Author <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="paste-lyrics-author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author or composer"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="paste-lyrics-body"
              className="text-sm font-medium text-foreground"
            >
              Lyrics
            </label>
            <Textarea
              id="paste-lyrics-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Verse 1 line 1\nVerse 1 line 2\n\nVerse 2 line 1\nVerse 2 line 2"}
              className="min-h-48 font-mono"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DrawerFooter className="flex flex-row justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
