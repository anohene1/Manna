// src/components/service-plan/template-manager.tsx
import { useState, useEffect, useCallback } from "react"
import { PencilIcon, TrashIcon, CheckIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useServicePlan } from "@/hooks/use-service-plan"
import type { TemplateMeta } from "@/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TemplateManager({ open, onOpenChange }: Props) {
  const { listTemplates, loadTemplate, saveAsTemplate, renameTemplate, deleteTemplate } =
    useServicePlan()
  const [templates, setTemplates] = useState<TemplateMeta[]>([])
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState("")

  const refresh = useCallback(() => {
    listTemplates().then(setTemplates).catch((e) => console.warn("listTemplates failed:", e))
  }, [listTemplates])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const save = async () => {
    if (!newName.trim()) return
    await saveAsTemplate(newName.trim())
    setNewName("")
    refresh()
  }

  const load = async (id: number) => {
    await loadTemplate(id)
    onOpenChange(false)
  }

  const startRename = (t: TemplateMeta) => {
    setEditingId(t.id)
    setEditingName(t.name)
  }

  const cancelRename = () => {
    setEditingId(null)
    setEditingName("")
  }

  const commitRename = async () => {
    if (editingId == null) return
    const name = editingName.trim()
    if (!name) {
      cancelRename()
      return
    }
    try {
      await renameTemplate(editingId, name)
      refresh()
    } catch (e) {
      toast.error(`Rename failed: ${e}`)
    } finally {
      cancelRename()
    }
  }

  const remove = async (t: TemplateMeta) => {
    if (!window.confirm(`Delete template "${t.name}"? This cannot be undone.`)) return
    try {
      await deleteTemplate(t.id)
      refresh()
    } catch (e) {
      toast.error(`Delete failed: ${e}`)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="left-1/2 right-auto max-h-[85vh] w-full max-w-2xl -translate-x-1/2">
        <DrawerHeader>
          <DrawerTitle>Service Plan Templates</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-2">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              Save current plan as template:
            </p>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Template name"
              />
              <Button onClick={save}>Save</Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Load template:</p>
            {templates.length === 0 && (
              <p className="text-xs text-muted-foreground">No templates yet.</p>
            )}
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                {editingId === t.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename()
                        if (e.key === "Escape") cancelRename()
                      }}
                      className="h-7 text-xs"
                    />
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon-xs" variant="ghost" onClick={() => void commitRename()}>
                        <CheckIcon className="size-3" />
                      </Button>
                      <Button size="icon-xs" variant="ghost" onClick={cancelRename}>
                        <XIcon className="size-3" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.itemCount} item{t.itemCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="icon-xs" variant="ghost" onClick={() => startRename(t)} title="Rename">
                        <PencilIcon className="size-3" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => void remove(t)}
                        title="Delete"
                        className="text-destructive"
                      >
                        <TrashIcon className="size-3" />
                      </Button>
                      <Button size="sm" onClick={() => load(t.id)}>Load</Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <DrawerFooter className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
