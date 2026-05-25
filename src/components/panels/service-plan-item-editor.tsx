import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import type { PlanItem, PlanItemPayload } from "@/types"
import { parsePlanItem } from "@/types"
import { useServicePlan } from "@/hooks/use-service-plan"
import { useAnnouncementDialogStore } from "@/lib/announcement-dialog"

interface Props {
  item: PlanItem | null
  onClose: () => void
}

export function ServicePlanItemEditor({ item, onClose }: Props) {
  const { updateItem } = useServicePlan()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [announcementMode, setAnnouncementMode] = useState<"ticker" | "slide">("slide")
  const [announcementDuration, setAnnouncementDuration] = useState<number | null>(null)
  const [label, setLabel] = useState("")
  const [autoAdvance, setAutoAdvance] = useState<string>("")
  const [blankShowLogo, setBlankShowLogo] = useState(true)
  const [blankImageUrl, setBlankImageUrl] = useState<string | undefined>(undefined)
  const [blankImageLabel, setBlankImageLabel] = useState("")

  useEffect(() => {
    if (!item) return
    const parsed = parsePlanItem(item)
    // Announcements use the shared AnnouncementDialog — redirect there and
    // close this editor immediately so we never render the legacy fields.
    if (parsed?.type === "announcement") {
      useAnnouncementDialogStore.getState().openAnnouncementForEdit(item)
      onClose()
      return
    }
    if (parsed?.type === "section") {
      setLabel(parsed.label)
    } else if (parsed?.type === "blank") {
      setBlankShowLogo(parsed.showLogo)
      setBlankImageUrl(parsed.imageUrl)
      setBlankImageLabel(parsed.imageLabel ?? "")
    }
    setAutoAdvance(item.autoAdvanceSeconds?.toString() ?? "")
  }, [item])

  if (!item) return null
  const parsed = parsePlanItem(item)
  if (!parsed) return null
  // Announcements are handled by AnnouncementDialog (redirected in useEffect
  // above). Render nothing to avoid a one-frame flash of the old editor.
  if (parsed.type === "announcement") return null

  const pickImage = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => setBlankImageUrl(reader.result as string)
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const save = async () => {
    let payload: PlanItemPayload
    if (parsed.type === "announcement") {
      payload = {
        type: "announcement",
        title,
        body,
        mode: announcementMode,
        duration: announcementDuration,
      }
    } else if (parsed.type === "section") {
      payload = { type: "section", label }
    } else if (parsed.type === "blank") {
      payload = {
        type: "blank",
        showLogo: blankShowLogo,
        ...(blankImageUrl ? { imageUrl: blankImageUrl } : {}),
        ...(blankImageLabel.trim() ? { imageLabel: blankImageLabel.trim() } : {}),
      }
    } else {
      onClose()
      return
    }
    const seconds = autoAdvance.trim() === "" ? null : Number(autoAdvance)
    await updateItem(item, payload, Number.isFinite(seconds) ? (seconds as number | null) : null)
    onClose()
  }

  return (
    <Drawer open={item != null} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="left-1/2 right-auto max-h-[85vh] w-full max-w-2xl -translate-x-1/2">
        <DrawerHeader>
          <DrawerTitle>
            Edit {parsed.type === "announcement" ? "announcement" : parsed.type === "blank" ? "blank slide" : "section"}
          </DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-2">
          {parsed.type === "announcement" ? (
            <>
              <div>
                <label className="text-xs font-medium">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium">Body</label>
                <textarea
                  className="mt-1 min-h-[100px] w-full rounded-md border bg-transparent p-2 text-sm"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Display mode</label>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAnnouncementMode("ticker")}
                    className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                      announcementMode === "ticker"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <div className="font-medium">Ticker</div>
                    <div className="text-[10px]">Scrolls at bottom; slide stays visible</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnnouncementMode("slide")}
                    className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                      announcementMode === "slide"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <div className="font-medium">Full slide</div>
                    <div className="text-[10px]">Takes over screen, left-aligned</div>
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Auto-dismiss</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {[
                    { label: "10s", value: 10 },
                    { label: "30s", value: 30 },
                    { label: "1m", value: 60 },
                    { label: "2m", value: 120 },
                    { label: "Manual", value: null },
                  ].map((d) => {
                    const active =
                      (d.value ?? "manual") === (announcementDuration ?? "manual")
                    return (
                      <button
                        key={d.label}
                        type="button"
                        onClick={() => setAnnouncementDuration(d.value)}
                        className={`rounded-full px-3 py-1 text-xs transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/60"
                        }`}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          ) : parsed.type === "section" ? (
            <div>
              <label className="text-xs font-medium">Label</label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
          ) : parsed.type === "blank" ? (
            <>
              <div>
                <label className="text-xs font-medium">Image</label>
                <div className="mt-1 flex flex-col gap-2">
                  {blankImageUrl && (
                    <img
                      src={blankImageUrl}
                      alt="Blank slide image"
                      className="max-h-40 rounded-md border bg-black object-contain"
                    />
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={pickImage}>
                      {blankImageUrl ? "Replace image" : "Upload image"}
                    </Button>
                    {blankImageUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setBlankImageUrl(undefined)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {blankImageUrl && (
                <div>
                  <label className="text-xs font-medium">Image label (optional)</label>
                  <Input
                    value={blankImageLabel}
                    onChange={(e) => setBlankImageLabel(e.target.value)}
                    placeholder="e.g. Welcome, Offering, Communion"
                  />
                </div>
              )}
              {!blankImageUrl && (
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                  <label className="text-xs font-medium">Show church logo (EWC)</label>
                  <input
                    type="checkbox"
                    checked={blankShowLogo}
                    onChange={(e) => setBlankShowLogo(e.target.checked)}
                  />
                </div>
              )}
            </>
          ) : null}
          <div>
            <label className="text-xs font-medium">Auto-advance (seconds, blank = manual)</label>
            <Input
              type="number"
              min={0}
              value={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.value)}
            />
          </div>
        </div>
        <DrawerFooter className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
