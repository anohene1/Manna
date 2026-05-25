import { useEffect, useState } from "react"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { useAnnouncementDialogStore } from "@/lib/announcement-dialog"
import { useBroadcastStore } from "@/stores"
import { useServicePlan } from "@/hooks/use-service-plan"
import { parsePlanItem, type PlanItemAnnouncement } from "@/types"
import { MegaphoneIcon, ScrollTextIcon, MonitorIcon } from "lucide-react"

const DURATIONS = [
  { label: "10s", value: 10 },
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "2m", value: 120 },
  { label: "Manual", value: null },
] as const

const PRESETS = [
  "Please silence your phones",
  "Welcome — please be seated",
  "Offering time",
  "Please stand for the reading",
  "Service ending in 5 minutes",
  "Greet someone next to you",
] as const

type Mode = "ticker" | "slide"

export function AnnouncementDialog() {
  const { isOpen, editingItem, closeAnnouncement } = useAnnouncementDialogStore()
  const { updateItem } = useServicePlan()
  const [text, setText] = useState("")
  const [duration, setDuration] = useState<number | null>(30)
  const [mode, setMode] = useState<Mode>("ticker")

  const isEditMode = editingItem !== null

  useEffect(() => {
    if (!isOpen) return
    if (editingItem) {
      const parsed = parsePlanItem(editingItem)
      if (parsed?.type === "announcement") {
        const t = parsed.title?.trim() ?? ""
        const b = parsed.body?.trim() ?? ""
        setText(b ? `${t}\n\n${b}` : t)
        setMode(parsed.mode ?? "slide")
        setDuration(parsed.duration ?? null)
      }
    } else {
      setText("")
      setMode("ticker")
      setDuration(30)
    }
  }, [isOpen, editingItem])

  async function handleSubmit() {
    if (!text.trim()) return
    if (isEditMode && editingItem) {
      const payload: PlanItemAnnouncement = {
        type: "announcement",
        title: text.trim(),
        body: "",
        mode,
        duration,
      }
      await updateItem(editingItem, payload, editingItem.autoAdvanceSeconds ?? null)
    } else {
      useBroadcastStore.getState().sendAnnouncement({
        text: text.trim(),
        mode,
        duration,
      })
    }
    closeAnnouncement()
  }

  async function handleSaveAndGoLive() {
    if (!text.trim() || !editingItem) return
    const payload: PlanItemAnnouncement = {
      type: "announcement",
      title: text.trim(),
      body: "",
      mode,
      duration,
    }
    await updateItem(editingItem, payload, editingItem.autoAdvanceSeconds ?? null)
    useBroadcastStore.getState().sendAnnouncement({
      text: text.trim(),
      mode,
      duration,
    })
    closeAnnouncement()
  }

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && closeAnnouncement()}>
      <DrawerContent className="left-1/2 right-auto max-h-[85vh] w-full max-w-2xl -translate-x-1/2">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <MegaphoneIcon className="size-4 text-primary" />
            {isEditMode ? "Edit announcement" : "New announcement"}
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
          {/* Text input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Message
            </label>
            <textarea
              className="min-h-[80px] w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Type your announcement…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit()
              }}
              autoFocus
            />
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setText(p)}
                  className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Display mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <ModeCard
                active={mode === "ticker"}
                onClick={() => setMode("ticker")}
                icon={<ScrollTextIcon className="size-4" />}
                title="Ticker"
                description="Scrolling strip at bottom; current slide stays visible"
              />
              <ModeCard
                active={mode === "slide"}
                onClick={() => setMode("slide")}
                icon={<MonitorIcon className="size-4" />}
                title="Full slide"
                description="Takes over screen; left-aligned text on theme background"
              />
            </div>
          </div>

          {/* Duration */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Duration
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => {
                const active = (d.value ?? "manual") === (duration ?? "manual")
                return (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setDuration(d.value)}
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

          {/* Preview */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Preview
            </label>
            <AnnouncementPreview text={text || "Your announcement preview"} mode={mode} />
          </div>
        </div>

        <DrawerFooter className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={closeAnnouncement}>
            Cancel
          </Button>
          <Button
            variant={isEditMode ? "outline" : "default"}
            onClick={handleSubmit}
            disabled={!text.trim()}
          >
            {isEditMode ? "Save" : "Send · ⌘↵"}
          </Button>
          {isEditMode && (
            <Button onClick={handleSaveAndGoLive} disabled={!text.trim()}>
              Save & Go Live
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
      <span className="text-[11px] text-muted-foreground">{description}</span>
    </button>
  )
}

function AnnouncementPreview({ text, mode }: { text: string; mode: Mode }) {
  const aspectClass = "aspect-[16/9]"
  if (mode === "ticker") {
    return (
      <div
        className={`relative ${aspectClass} w-full overflow-hidden rounded-lg bg-gradient-to-br from-slate-900 to-slate-950 ring-1 ring-border`}
      >
        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-white/20">
          current slide stays here
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-black/75 backdrop-blur">
          <div className="overflow-hidden whitespace-nowrap py-2">
            <div className="animate-[ticker_18s_linear_infinite] inline-block px-6 text-sm font-medium text-white">
              {text}
            </div>
          </div>
        </div>
        <style>{`
          @keyframes ticker { from { transform: translateX(100%); } to { transform: translateX(-100%); } }
        `}</style>
      </div>
    )
  }
  return (
    <div
      className={`relative ${aspectClass} w-full overflow-hidden rounded-lg bg-gradient-to-br from-slate-950 to-black ring-1 ring-border`}
    >
      <div className="absolute inset-0 flex items-center px-[6%]">
        <p className="whitespace-pre-line text-left text-xl font-semibold leading-snug text-white">
          {text}
        </p>
      </div>
    </div>
  )
}
