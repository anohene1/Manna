import { useEffect, useState } from "react"
import { GripVerticalIcon, Trash2Icon, PencilIcon, BookOpenIcon, MusicIcon, MegaphoneIcon, SquareIcon, MinusIcon } from "lucide-react"
import type { PlanItem } from "@/types"
import { parsePlanItem } from "@/types"
import { Button } from "@/components/ui/button"
import { useServicePlan } from "@/hooks/use-service-plan"
import { useSongStore } from "@/stores"
import { activatePlanItem } from "@/components/service-plan/activation-router"

interface Props {
  item: PlanItem
  isActive: boolean
  pendingAdvanceDeadline: number | null
  pendingAdvanceTotalMs?: number | null
  onEdit: (item: PlanItem) => void
  dragAttrs?: React.HTMLAttributes<HTMLDivElement>
  dragRef?: React.Ref<HTMLDivElement>
}

function iconFor(type: PlanItem["itemType"]) {
  switch (type) {
    case "verse": return <BookOpenIcon className="size-3.5" />
    case "song": return <MusicIcon className="size-3.5" />
    case "announcement": return <MegaphoneIcon className="size-3.5" />
    case "section": return <MinusIcon className="size-3.5" />
    case "blank": return <SquareIcon className="size-3.5" />
  }
}

function ItemLabel({ item }: { item: PlanItem }) {
  const parsed = parsePlanItem(item)
  const songTitle = useSongStore((s) =>
    parsed && parsed.type === "song" ? s.songs.find((x) => x.id === parsed.songId)?.title ?? null : null,
  )
  if (!parsed) return <>(invalid)</>
  switch (parsed.type) {
    case "verse": return <>{`${parsed.bookName} ${parsed.chapter}:${parsed.verse}`}</>
    case "song": return <>{songTitle ?? `Song ${parsed.songId}`}</>
    case "announcement": return <>{parsed.title}</>
    case "section": return <>{parsed.label}</>
    case "blank": return <>{parsed.showLogo ? "Blank (logo)" : "Blank"}</>
  }
}

export function ServicePlanItem({
  item,
  isActive,
  pendingAdvanceDeadline,
  pendingAdvanceTotalMs,
  onEdit,
  dragAttrs,
  dragRef,
}: Props) {
  const { setActiveItem, deleteItem } = useServicePlan()
  const editable = item.itemType === "announcement" || item.itemType === "section"

  const onClick = () => {
    if (item.itemType === "section") return
    setActiveItem(item.id)
    activatePlanItem(item)
  }

  return (
    <div
      ref={dragRef}
      {...dragAttrs}
      className={`group relative flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
        isActive ? "border-red-500/60 bg-red-500/5" : "border-border bg-card hover:bg-muted/50"
      } ${item.itemType === "section" ? "opacity-70" : "cursor-pointer"}`}
      onClick={onClick}
    >
      <GripVerticalIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        {iconFor(item.itemType)}
      </div>
      <div className="min-w-0 flex-1 truncate"><ItemLabel item={item} /></div>
      {isActive && <span className="text-[10px] font-medium text-red-500">Live</span>}

      {editable && (
        <Button
          size="icon"
          variant="ghost"
          className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(item)
          }}
        >
          <PencilIcon className="size-3" />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          deleteItem(item.id)
        }}
      >
        <Trash2Icon className="size-3" />
      </Button>

      {isActive && pendingAdvanceDeadline != null && pendingAdvanceTotalMs != null && (
        <AdvanceProgressBar
          deadline={pendingAdvanceDeadline}
          totalMs={pendingAdvanceTotalMs}
        />
      )}
    </div>
  )
}

function AdvanceProgressBar({ deadline, totalMs }: { deadline: number; totalMs: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let raf = 0
    const tick = () => {
      setNow(Date.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [deadline])

  const remaining = Math.max(0, deadline - now)
  const elapsed = Math.max(0, totalMs - remaining)
  const pct = Math.min(100, Math.max(0, (elapsed / totalMs) * 100))
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-red-500/20">
      <div className="h-full bg-red-500" style={{ width: `${pct}%` }} />
    </div>
  )
}
