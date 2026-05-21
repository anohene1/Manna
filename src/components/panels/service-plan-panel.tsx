// src/components/panels/service-plan-panel.tsx
import { useState, useEffect } from "react"
import { CalendarDaysIcon, FolderIcon } from "lucide-react"
import { DragDropProvider } from "@dnd-kit/react"
import { useSortable, isSortable } from "@dnd-kit/react/sortable"
import { useServicePlan } from "@/hooks/use-service-plan"
import { useServicePlanStore } from "@/stores/service-plan-store"
import { activatePlanItem } from "@/components/service-plan/activation-router"
import { AddItemMenu } from "@/components/service-plan/add-item-menu"
import { ServicePlanItem } from "./service-plan-item"
import { ServicePlanItemEditor } from "./service-plan-item-editor"
import { TemplateManager } from "@/components/service-plan/template-manager"
import { Button } from "@/components/ui/button"
import type { PlanItem } from "@/types"

export function ServicePlanPanel() {
  const { plan, activeItemId, pendingAdvanceDeadline, pendingAdvanceTotalMs, setActiveItem, reorderItem } =
    useServicePlan()
  const [editing, setEditing] = useState<PlanItem | null>(null)
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false)

  /* Keyboard: ↑/↓ navigate, Enter activate, Cmd/Ctrl+↑/↓ reorder. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!plan || plan.items.length === 0) return
      const targets = ["INPUT", "TEXTAREA"]
      if (targets.includes((e.target as HTMLElement).tagName)) return

      const idx = plan.items.findIndex((i) => i.id === activeItemId)
      const modifier = e.metaKey || e.ctrlKey

      if (e.key === "ArrowDown" && modifier) {
        if (idx < 0 || idx >= plan.items.length - 1) return
        e.preventDefault()
        const dragged = plan.items[idx]
        const newPrev = plan.items[idx + 1] // dragged inserts AFTER the next item
        const newNext = idx + 2 < plan.items.length ? plan.items[idx + 2] : null
        void reorderItem(dragged, newPrev.id, newNext?.id ?? null)
      } else if (e.key === "ArrowUp" && modifier) {
        if (idx <= 0) return
        e.preventDefault()
        const dragged = plan.items[idx]
        const newPrev = idx - 2 >= 0 ? plan.items[idx - 2] : null
        const newNext = plan.items[idx - 1]
        void reorderItem(dragged, newPrev?.id ?? null, newNext.id)
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        const next = plan.items[Math.min(plan.items.length - 1, Math.max(0, idx + 1))]
        setActiveItem(next.id)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        const prev = plan.items[Math.max(0, idx - 1)]
        setActiveItem(prev.id)
      } else if (e.key === "Enter") {
        if (idx >= 0) {
          e.preventDefault()
          activatePlanItem(plan.items[idx])
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [plan, activeItemId, setActiveItem, reorderItem])

  /* Auto-advance: when active item has autoAdvanceSeconds, schedule timer. */
  useEffect(() => {
    const store = useServicePlanStore.getState()
    store.cancelPendingAdvance()

    if (!plan || activeItemId == null) return
    const active = plan.items.find((i) => i.id === activeItemId)
    if (!active || active.autoAdvanceSeconds == null || active.autoAdvanceSeconds <= 0) return

    const ms = active.autoAdvanceSeconds * 1000
    const deadline = Date.now() + ms
    const timer = setTimeout(() => {
      const next = useServicePlanStore.getState().nextPlayableAfter(active.id)
      if (!next) return
      useServicePlanStore.getState().setActiveItem(next.id)
      activatePlanItem(next)
    }, ms)
    store.setPendingAdvance(timer, deadline, ms)

    return () => store.cancelPendingAdvance()
  }, [plan, activeItemId])

  const handleDragEnd = (event: { canceled: boolean; operation: { source: unknown } }) => {
    if (event.canceled || !plan) return
    const source = event.operation.source
    if (!isSortable(source)) return
    const { initialIndex, index } = source
    if (initialIndex === index) return
    const dragged = plan.items[initialIndex]
    if (!dragged) return
    // Compute neighbors in the new order
    const reordered = [...plan.items]
    const [removed] = reordered.splice(initialIndex, 1)
    reordered.splice(index, 0, removed)
    const prevId = index > 0 ? reordered[index - 1].id : null
    const nextId = index < reordered.length - 1 ? reordered[index + 1].id : null
    void reorderItem(dragged, prevId, nextId)
  }

  if (!plan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
        <CalendarDaysIcon className="size-6 opacity-40" />
        <p>Start a session to build a service plan.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Service Plan
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setTemplateManagerOpen(true)}
          >
            <FolderIcon className="size-3.5" />
            Templates
          </Button>
          <AddItemMenu />
        </div>
      </div>

      <DragDropProvider onDragEnd={handleDragEnd}>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {plan.items.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              Empty plan. Click <span className="font-medium">Add</span> to insert items.
            </div>
          )}
          {plan.items.map((item, idx) => (
            <SortableRow
              key={item.id}
              item={item}
              index={idx}
              isActive={activeItemId === item.id}
              pendingAdvanceDeadline={pendingAdvanceDeadline}
              pendingAdvanceTotalMs={pendingAdvanceTotalMs}
              onEdit={setEditing}
            />
          ))}
        </div>
      </DragDropProvider>

      <ServicePlanItemEditor item={editing} onClose={() => setEditing(null)} />
      <TemplateManager open={templateManagerOpen} onOpenChange={setTemplateManagerOpen} />
    </div>
  )
}

interface SortableRowProps {
  item: PlanItem
  index: number
  isActive: boolean
  pendingAdvanceDeadline: number | null
  pendingAdvanceTotalMs: number | null
  onEdit: (item: PlanItem) => void
}

function SortableRow({
  item,
  index,
  isActive,
  pendingAdvanceDeadline,
  pendingAdvanceTotalMs,
  onEdit,
}: SortableRowProps) {
  const { ref, isDragging } = useSortable({ id: item.id, index })
  return (
    <div ref={ref} className={isDragging ? "opacity-50" : ""}>
      <ServicePlanItem
        item={item}
        isActive={isActive}
        pendingAdvanceDeadline={pendingAdvanceDeadline}
        pendingAdvanceTotalMs={pendingAdvanceTotalMs}
        onEdit={onEdit}
      />
    </div>
  )
}
