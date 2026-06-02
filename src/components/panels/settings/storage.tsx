import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ask } from "@tauri-apps/plugin-dialog"
import { Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { SermonSession } from "@/types/session"

export function StoragePanel() {
  const [sessions, setSessions] = useState<SermonSession[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const all = await invoke<SermonSession[]>("list_sessions")
      setSessions(all.filter((s) => s.audioPath))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const onDelete = async (s: SermonSession) => {
    const ok = await ask(`Delete the recording for "${s.title}"?`, {
      title: "Delete audio",
      kind: "warning",
    })
    if (!ok) return
    await invoke("delete_session_audio", { sessionId: s.id })
    void load()
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading…</p>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Audio recordings of past sessions appear here. Deleting a recording
          frees disk space but keeps the session, transcript, detections, and
          summary.
        </p>
        <p className="text-sm text-muted-foreground">No recordings yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Audio recordings of past sessions. Delete any you no longer need to
        reclaim disk space; the session record, transcript, detections, and
        summary stay available.
      </p>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{s.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {s.date} · {s.audioPath}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void onDelete(s)}
              title="Delete recording"
              aria-label={`Delete recording for ${s.title}`}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
