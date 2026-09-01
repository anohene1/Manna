import { useBroadcastStore } from "@/stores/broadcast-store"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TextProperties } from "@/components/broadcast/text-properties"
import { BackgroundProperties } from "@/components/broadcast/background-properties"
import { LayoutProperties } from "@/components/broadcast/layout-properties"
import { HtmlTemplateEditor } from "@/components/broadcast/html-template-editor"
import {
  TypeIcon,
  PaletteIcon,
  LayoutIcon,
  MousePointerClickIcon,
} from "lucide-react"

export function PropertiesPanel() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)

  if (!draftTheme) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 border-l border-border bg-card p-6">
        <MousePointerClickIcon className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Select a theme to edit</p>
      </div>
    )
  }

  if (draftTheme.htmlTemplate) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-card">
        <div className="flex h-10 items-center border-b border-border px-4">
          <h3 className="truncate text-sm font-semibold">{draftTheme.name}</h3>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <div>
            <p className="text-xs font-semibold">HTML / CSS</p>
            <p className="mt-1 text-[0.625rem] leading-relaxed text-muted-foreground">
              Static templates only. Use {"{{verse}}"}, {"{{reference}}"},{" "}
              {"{{referencePlain}}"}, {"{{verseNumber}}"}, {"{{translation}}"},{" "}
              {"{{contentLabel}}"}, {"{{translationLabel}}"}, {"{{churchName}}"}
              , and {"{{logoUrl}}"} placeholders.
            </p>
          </div>
          <HtmlTemplateEditor
            value={draftTheme.htmlTemplate.source}
            onChange={(source) =>
              useBroadcastStore.getState().updateDraft({
                htmlTemplate: { source },
              })
            }
          />
          <p className="text-[0.625rem] text-muted-foreground">
            Mark the moving lower-third container with data-manna-lower-third so
            it automatically clears an active ticker. Format with Shift+Alt+F.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-card">
      {/* Header */}
      <div className="flex h-10 items-center border-b border-border px-4">
        <h3 className="truncate text-sm font-semibold">{draftTheme.name}</h3>
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue="text"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 px-4 pt-3">
          <TabsList variant="default" className="w-full rounded-full">
            <TabsTrigger value="text" className="gap-1.5 rounded-full">
              <TypeIcon className="size-3.5" />
              Text
            </TabsTrigger>
            <TabsTrigger
              value="background"
              className="gap-1.5 rounded-full"
              title="Edit the canvas background or lower-third text box"
            >
              <PaletteIcon className="size-3.5" />
              Background
            </TabsTrigger>
            <TabsTrigger value="layout" className="gap-1.5 rounded-full">
              <LayoutIcon className="size-3.5" />
              Layout
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="text" className="mt-0 p-4">
            <TextProperties />
          </TabsContent>
          <TabsContent value="background" className="mt-0 p-4">
            <BackgroundProperties
              textBoxOnly={draftTheme.kind === "lower-third"}
            />
          </TabsContent>
          <TabsContent value="layout" className="mt-0 p-4">
            <LayoutProperties />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
