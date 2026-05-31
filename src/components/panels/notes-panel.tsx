import { useState, useEffect, useCallback, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { useSessionStore, useBroadcastStore } from "@/stores"
import { PanelHeader } from "@/components/ui/panel-header"
import { Badge } from "@/components/ui/badge"
import { PencilIcon, SendIcon, StickyNoteIcon, SparklesIcon, Loader2Icon } from "lucide-react"
import type { SessionNote } from "@/types/session"
import { renderInlineMarkdown } from "@/lib/markdown-inline"
import { generateLiveNotesNow, describeGenerationContext } from "@/lib/ai-notes-scheduler"
import { toast } from "sonner"

type TimelineItem = { kind: "note"; data: SessionNote; timestamp: number }

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

export function NotesPanel() {
  const activeSession = useSessionStore((s) => s.activeSession)
  const [input, setInput] = useState("")
  const [notes, setNotes] = useState<SessionNote[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [generating, setGenerating] = useState(false)

  const sessionId = activeSession?.id
  const liveBullets = useBroadcastStore((s) => s.liveNotes?.bullets ?? null)
  const liveBulletIds = useMemo(
    () => new Set(liveBullets?.map((b) => b.id) ?? []),
    [liveBullets],
  )

  const loadData = useCallback(async () => {
    if (!sessionId) return
    const n = await invoke<SessionNote[]>("get_session_notes", { sessionId })
    setNotes(n)
  }, [sessionId])

  useEffect(() => {
    setNotes([])
    loadData()
  }, [loadData])

  // Poll for updates while session is active
  useEffect(() => {
    if (!sessionId) return
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [sessionId, loadData])

  const handleSubmit = async () => {
    if (!sessionId || !input.trim()) return
    setSubmitting(true)
    try {
      await invoke("add_session_note", {
        request: { sessionId, noteType: "manual", content: input.trim() },
      })
      setInput("")
      await loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    const ctx = describeGenerationContext()
    try {
      const created = await generateLiveNotesNow()
      if (created === 0) {
        toast.info(
          `No new points — AI saw nothing new beyond existing bullets. (${ctx})`,
        )
      } else {
        toast.success(
          `Added ${created} AI point${created > 1 ? "s" : ""}. (${ctx})`,
        )
        await loadData()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  if (!activeSession) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader title="Notes" icon={<StickyNoteIcon className="size-3.5" />} />
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-xs text-muted-foreground">
            Start a service to begin taking notes
          </p>
        </div>
      </div>
    )
  }

  // Notes-only timeline, newest first. Detections live in their own panel.
  const timeline: TimelineItem[] = notes
    .map((n) => ({
      kind: "note" as const,
      data: n,
      timestamp: new Date(n.createdAt).getTime(),
    }))
    .sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Notes" icon={<StickyNoteIcon className="size-3.5" />}>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
          title="Ask DeepSeek to extract 1-2 NEW points from the transcript so far"
        >
          {generating ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <SparklesIcon className="size-3" />
          )}
          Generate points
        </button>
      </PanelHeader>

      {/* Input */}
      <div className="shrink-0 border-b border-border p-2">
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1">
          <input
            type="text"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            placeholder="Add a note..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !input.trim()}
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-primary disabled:opacity-40"
          >
            <SendIcon className="size-3.5" />
          </button>
        </div>
        <p className="mt-1 px-1 text-[10px] text-muted-foreground">
          Tip: <code>**bold**</code> / <code>*italic*</code>
        </p>
      </div>

      {/* Timeline */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {timeline.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No notes yet
          </p>
        )}

        <div className="flex flex-col gap-1 p-2">
          {timeline.map((item) => {
            const note = item.data
            const isAi = note.noteType === "ai"
            return (
              <div
                key={`note-${note.id}`}
                className={`rounded-lg p-2.5 ${
                  isAi
                    ? "border border-amber-500/20 bg-amber-500/5"
                    : "bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-2">
                  {isAi ? (
                    <SparklesIcon className="mt-0.5 size-3 shrink-0 text-amber-500" />
                  ) : (
                    <PencilIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed text-foreground">
                      {renderInlineMarkdown(note.content)}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <p className="text-[10px] text-muted-foreground">
                        {formatTime(note.createdAt)}
                      </p>
                      {liveBulletIds.has(note.id) && (
                        <Badge className="bg-primary/15 px-1.5 py-0 text-[8px] font-semibold text-primary">
                          LIVE
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
