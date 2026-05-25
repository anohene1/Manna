import { useEffect, useMemo, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PencilIcon, CheckIcon, XIcon, PlusIcon, SparklesIcon } from "lucide-react"
import { useNotesSelectionDrawerStore } from "@/lib/notes-selection-drawer"
import { useServicePlan } from "@/hooks/use-service-plan"
import { useServicePlanStore } from "@/stores/service-plan-store"
import { useBroadcastStore, useSessionStore } from "@/stores"
import { parsePlanItem } from "@/types"
import type { SessionNote, NotesSlide } from "@/types"
import { renderInlineMarkdown } from "@/lib/markdown-inline"

export function NotesSelectionDrawer() {
  const isOpen = useNotesSelectionDrawerStore((s) => s.isOpen)
  const planItemId = useNotesSelectionDrawerStore((s) => s.planItemId)
  const close = useNotesSelectionDrawerStore((s) => s.close)

  const sessionId = useSessionStore((s) => s.activeSession?.id ?? null)
  const liveNotes = useBroadcastStore((s) => s.liveNotes)
  const setLiveNotes = useBroadcastStore((s) => s.setLiveNotes)
  const { updateItem } = useServicePlan()
  const plan = useServicePlanStore((s) => s.plan)

  const planItem = useMemo(
    () => plan?.items.find((i) => i.id === planItemId) ?? null,
    [plan, planItemId],
  )
  const parsed = planItem ? parsePlanItem(planItem) : null
  const notesPayload = parsed?.type === "notes" ? parsed : null

  const [notes, setNotes] = useState<SessionNote[]>([])
  const [title, setTitle] = useState("")
  const [selection, setSelection] = useState<number[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [newDraft, setNewDraft] = useState("")
  const [savingNew, setSavingNew] = useState(false)

  const loadNotes = async () => {
    if (sessionId == null) return
    try {
      const rows = await invoke<SessionNote[]>("get_session_notes", { sessionId })
      setNotes(
        [...rows].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      )
    } catch {
      setNotes([])
    }
  }

  // Reset + load every time the drawer reopens.
  useEffect(() => {
    if (!isOpen || sessionId == null || !notesPayload) return
    setTitle(notesPayload.title)
    setSelection(notesPayload.lastSelection)
    setEditingId(null)
    setEditDraft("")
    setNewDraft("")
    loadNotes()
    // notesPayload identity changes on every parse — depend on its data only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sessionId, planItemId])

  const isMineLive = liveNotes?.planItemId === planItemId
  const canGoLive = selection.length > 0

  const toggle = (id: number) => {
    setSelection((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id],
    )
  }

  const buildSlide = (): NotesSlide | null => {
    if (!planItem) return null
    const noteMap = new Map(notes.map((n) => [n.id, n.content]))
    const bullets = selection
      .map((id) => (noteMap.has(id) ? { id, markdown: noteMap.get(id)! } : null))
      .filter((b): b is { id: number; markdown: string } => b != null)
    return { planItemId: planItem.id, title: title.trim(), bullets }
  }

  const startEdit = (note: SessionNote) => {
    setEditingId(note.id)
    setEditDraft(note.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft("")
  }

  const saveEdit = async () => {
    if (editingId == null) return
    const content = editDraft.trim()
    if (!content) {
      cancelEdit()
      return
    }
    try {
      await invoke("update_session_note", { id: editingId, content })
      setNotes((prev) =>
        prev.map((n) => (n.id === editingId ? { ...n, content } : n)),
      )
      // If this note is part of the live slide, push the updated text.
      if (liveNotes && liveNotes.bullets.some((b) => b.id === editingId)) {
        setLiveNotes({
          ...liveNotes,
          bullets: liveNotes.bullets.map((b) =>
            b.id === editingId ? { ...b, markdown: content } : b,
          ),
        })
      }
    } catch (e) {
      console.warn("[notes-drawer] update failed:", e)
    } finally {
      cancelEdit()
    }
  }

  const addNote = async () => {
    if (sessionId == null) return
    const content = newDraft.trim()
    if (!content) return
    setSavingNew(true)
    try {
      const note = await invoke<SessionNote>("add_session_note", {
        request: { sessionId, noteType: "manual", content },
      })
      setNotes((prev) =>
        [...prev, note].sort(
          (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
        ),
      )
      setNewDraft("")
    } catch (e) {
      console.warn("[notes-drawer] add failed:", e)
    } finally {
      setSavingNew(false)
    }
  }

  const persistAndEmit = async (closeAfter: boolean) => {
    if (!planItem || !notesPayload) return
    await updateItem(
      planItem,
      { type: "notes", title: title.trim(), lastSelection: selection },
      planItem.autoAdvanceSeconds,
    )
    const slide = buildSlide()
    if (slide) setLiveNotes(slide)
    if (closeAfter) close()
  }

  return (
    <Drawer open={isOpen} onOpenChange={(o) => !o && close()}>
      <DrawerContent className="left-1/2 right-auto max-h-[75vh] w-full max-w-2xl -translate-x-1/2">
        <DrawerHeader>
          <DrawerTitle>Notes — {title || "Untitled"}</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 pb-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Title (optional)</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Three Marks of Faith"
            />
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              Tap notes to add as bullets. Tap again to remove.
            </p>
            <div className="flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto rounded-md border border-border bg-card">
              {notes.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No notes yet in this session.
                </p>
              )}
              {notes.map((n) => {
                const idx = selection.indexOf(n.id)
                const picked = idx >= 0
                const isEditing = editingId === n.id
                return (
                  <div
                    key={n.id}
                    className={`group flex items-start gap-2 px-3 py-2 text-xs transition-colors ${
                      picked ? "bg-primary/10" : "hover:bg-muted/40"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(n.id)}
                      disabled={isEditing}
                      className="w-5 shrink-0 text-left font-semibold text-primary disabled:opacity-50"
                    >
                      {picked ? idx + 1 : "·"}
                    </button>
                    {n.noteType === "ai" && !isEditing && (
                      <SparklesIcon className="mt-0.5 size-3 shrink-0 text-amber-500" />
                    )}
                    {isEditing ? (
                      <>
                        <Input
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              saveEdit()
                            } else if (e.key === "Escape") {
                              e.preventDefault()
                              cancelEdit()
                            }
                          }}
                          className="h-7 flex-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-primary"
                          title="Save (Enter)"
                        >
                          <CheckIcon className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
                          title="Cancel (Esc)"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => toggle(n.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span>{renderInlineMarkdown(n.content)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            startEdit(n)
                          }}
                          className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                          title="Edit"
                        >
                          <PencilIcon className="size-3" />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Inline add-note row */}
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={newDraft}
                onChange={(e) => setNewDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addNote()
                  }
                }}
                placeholder="Add a new note (Enter to save)…"
                disabled={savingNew || sessionId == null}
                className="h-8 flex-1 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={addNote}
                disabled={savingNew || !newDraft.trim()}
                className="gap-1"
              >
                <PlusIcon className="size-3" />
                Add
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Live preview</label>
            <div className="rounded-md border border-border bg-background p-4">
              {title && (
                <div className="mb-2 text-xs font-semibold text-primary">{title}</div>
              )}
              {selection.length === 0 ? (
                <p className="text-xs text-muted-foreground">No bullets picked</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {selection.map((id) => {
                    const n = notes.find((x) => x.id === id)
                    if (!n) return null
                    return (
                      <li key={id} className="flex gap-2">
                        <span className="text-primary">•</span>
                        <span>{renderInlineMarkdown(n.content)}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <DrawerFooter className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          {isMineLive ? (
            <Button onClick={() => persistAndEmit(false)} disabled={!canGoLive}>
              Update slide
            </Button>
          ) : (
            <Button onClick={() => persistAndEmit(true)} disabled={!canGoLive}>
              Go Live
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
