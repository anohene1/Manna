import { useState, useMemo, useRef } from "react"
import { toast } from "sonner"
import { useBroadcastStore } from "@/stores"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  PlusIcon,
  HeartIcon,
  MoreHorizontalIcon,
  SearchIcon,
  DownloadIcon,
  UploadIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { BroadcastTheme, VerseRenderData } from "@/types"

type FilterTab = "all" | "lower-thirds" | "pinned" | "custom"

const THUMBNAIL_VERSE: VerseRenderData = {
  reference: "John 3:16 (KJV)",
  segments: [{ text: "Sample Verse" }],
}

function ThemeCard({
  theme,
  isActive,
  isEditing,
  onSelect,
}: {
  theme: BroadcastTheme
  isActive: boolean
  isEditing: boolean
  onSelect: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      className={cn(
        "group relative flex w-full flex-col gap-1.5 rounded-lg p-1.5 text-left transition-colors hover:bg-muted/50",
        isEditing && "ring-2 ring-primary"
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg">
        <CanvasVerse theme={theme} verse={THUMBNAIL_VERSE} className="w-full" />

        {/* Active badge */}
        {isActive && (
          <Badge className="absolute top-1.5 left-1.5 bg-emerald-600 text-[0.5rem] text-white hover:bg-emerald-600">
            Active
          </Badge>
        )}

        {/* Pin icon */}
        {theme.pinned && (
          <div className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-background/80">
            <HeartIcon className="size-3 text-primary" strokeWidth={2} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-center gap-1.5 px-0.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {theme.name}
          </p>
          {isActive && (
            <p className="text-[0.5rem] text-muted-foreground">Default</p>
          )}
        </div>

        {/* Tags */}
        <div className="flex shrink-0 items-center gap-1">
          {theme.builtin && (
            <Badge variant="outline" className="text-[0.5rem]">
              Built-in
            </Badge>
          )}
          {theme.kind === "lower-third" && (
            <Badge variant="outline" className="text-[0.5rem]">
              {theme.htmlTemplate ? "HTML" : "Lower third"}
            </Badge>
          )}
        </div>

        {/* More menu */}
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <MoreHorizontalIcon className="size-3" />
        </Button>
      </div>
    </div>
  )
}

export function ThemeLibrary() {
  const themes = useBroadcastStore((s) => s.themes)
  const activeThemeId = useBroadcastStore((s) => s.activeThemeId)
  const lowerThirdThemeId = useBroadcastStore((s) => s.lowerThirdThemeId)
  const editingThemeId = useBroadcastStore((s) => s.editingThemeId)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterTab>("all")
  const importInputRef = useRef<HTMLInputElement>(null)

  const filteredThemes = useMemo(() => {
    let result = themes
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(q))
    }
    if (filter === "pinned") result = result.filter((t) => t.pinned)
    if (filter === "custom") result = result.filter((t) => !t.builtin)
    if (filter === "lower-thirds") {
      result = result.filter((t) => t.kind === "lower-third")
    }
    return result
  }, [themes, search, filter])

  const builtinThemes = filteredThemes.filter((t) => t.builtin)
  const customThemes = filteredThemes.filter((t) => !t.builtin)

  const handleNewTheme = () => {
    const firstTheme = themes[0]
    if (firstTheme) {
      useBroadcastStore.getState().duplicateTheme(firstTheme.id)
    }
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const source = await file.text()
      const isHtml = /\.html?$/i.test(file.name)
      let importedThemes: BroadcastTheme[]
      if (isHtml) {
        const base = themes.find((theme) => theme.kind === "lower-third")
        if (!base) throw new Error("No lower-third base theme is available.")
        importedThemes = [
          {
            ...base,
            id: crypto.randomUUID(),
            name: file.name.replace(/\.html?$/i, "") || "HTML Lower Third",
            builtin: false,
            pinned: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            kind: "lower-third",
            htmlTemplate: { source },
          },
        ]
      } else {
        const parsed = JSON.parse(source) as
          Partial<BroadcastTheme> | Partial<BroadcastTheme>[]
        const candidates = Array.isArray(parsed) ? parsed : [parsed]
        if (candidates.length === 0) throw new Error("The theme file is empty.")
        importedThemes = candidates.map((candidate) => {
          if (!candidate.name || !candidate.resolution || !candidate.layout) {
            throw new Error("This JSON file is not a Manna broadcast theme.")
          }
          return {
            ...(candidate as BroadcastTheme),
            id: crypto.randomUUID(),
            builtin: false,
            pinned: false,
            kind: candidate.kind ?? "slide",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
        })
      }
      for (const theme of importedThemes) {
        useBroadcastStore.getState().saveTheme(theme)
      }
      const imported = importedThemes[0]
      useBroadcastStore.getState().startEditing(imported.id)
      setFilter("custom")
      toast.success(
        importedThemes.length === 1
          ? `Imported “${imported.name}”`
          : `Imported ${importedThemes.length} themes`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.")
    } finally {
      if (importInputRef.current) importInputRef.current.value = ""
    }
  }

  const handleExportAll = () => {
    const customThemes = themes.filter((theme) => !theme.builtin)
    const blob = new Blob([JSON.stringify(customThemes, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "manna-custom-themes.json"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-card">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        <span className="text-lg font-semibold text-foreground">Themes</span>
        <Button onClick={handleNewTheme}>
          <PlusIcon className="size-4" />
          New
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-4">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search themes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as FilterTab)}
        className="shrink-0 px-3 pb-4"
      >
        <TabsList className="h-7 w-full">
          <TabsTrigger value="all" className="capitalize">
            all
          </TabsTrigger>
          <TabsTrigger value="lower-thirds" className="capitalize">
            lower thirds
          </TabsTrigger>
          <TabsTrigger value="pinned" className="capitalize">
            pinned
          </TabsTrigger>
          <TabsTrigger value="custom" className="capitalize">
            custom
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Import / Export */}
      <div className="flex gap-1.5 px-3 pb-3">
        <input
          ref={importInputRef}
          type="file"
          accept=".html,.htm,.json,text/html,application/json"
          className="hidden"
          onChange={(event) => void handleImport(event.target.files?.[0])}
        />
        <Button
          variant="outline"
          className="flex-1 border-border bg-transparent"
          onClick={() => importInputRef.current?.click()}
        >
          <UploadIcon className="size-2.5" />
          Import
        </Button>
        <Button
          variant="outline"
          className="flex-1 border-border bg-transparent"
          onClick={handleExportAll}
          disabled={!themes.some((theme) => !theme.builtin)}
        >
          <DownloadIcon className="size-2.5" />
          Export All
        </Button>
      </div>

      {/* Theme list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-2 pb-4">
          {/* Built-in section */}
          {builtinThemes.length > 0 && (
            <>
              <p className="px-1.5 pt-2 pb-1 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                Built-in
              </p>
              {builtinThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  isActive={
                    theme.id ===
                    (theme.kind === "lower-third"
                      ? lowerThirdThemeId
                      : activeThemeId)
                  }
                  isEditing={theme.id === editingThemeId}
                  onSelect={() =>
                    useBroadcastStore.getState().startEditing(theme.id)
                  }
                />
              ))}
            </>
          )}

          {/* Custom section */}
          {customThemes.length > 0 && (
            <>
              <p className="px-1.5 pt-3 pb-1 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                Custom
              </p>
              {customThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  isActive={
                    theme.id ===
                    (theme.kind === "lower-third"
                      ? lowerThirdThemeId
                      : activeThemeId)
                  }
                  isEditing={theme.id === editingThemeId}
                  onSelect={() =>
                    useBroadcastStore.getState().startEditing(theme.id)
                  }
                />
              ))}
            </>
          )}

          {filteredThemes.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No themes found
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
