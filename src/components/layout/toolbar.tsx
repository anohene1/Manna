import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ask } from "@tauri-apps/plugin-dialog"
import {
  useAudioStore,
  useTranscriptStore,
  useSessionStore,
} from "@/stores"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LevelMeter } from "@/components/ui/level-meter"
import { LiveIndicator } from "@/components/ui/live-indicator"
import { ApiKeyPrompt } from "@/components/ui/api-key-prompt"
import { PreflightChecklist } from "@/components/preflight-checklist"
import { startServiceFlow } from "@/lib/start-service"
import { getWorkspaceMode, getWorkspaceModeCopy } from "@/lib/workspace-mode"
import { MicIcon, MicOffIcon, Loader2Icon, HomeIcon } from "lucide-react"

/* -------------------------------------------------------------------------- */
/*  Elapsed timer                                                             */
/* -------------------------------------------------------------------------- */

function formatElapsed(startMs: number): string {
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
  const h = Math.floor(elapsedSec / 3600)
  const m = Math.floor((elapsedSec % 3600) / 60)
  const s = elapsedSec % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function ElapsedTimer({ startMs }: { startMs: number }) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(startMs))

  useEffect(() => {
    setElapsed(formatElapsed(startMs))
    const interval = setInterval(() => {
      setElapsed(formatElapsed(startMs))
    }, 1000)
    return () => clearInterval(interval)
  }, [startMs])

  return (
    <span className="font-mono text-xs tabular-nums text-muted-foreground">
      {elapsed}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  Toolbar                                                                   */
/* -------------------------------------------------------------------------- */

export function Toolbar() {
  const activeSession = useSessionStore((s) => s.activeSession)
  const isTranscribing = useTranscriptStore((s) => s.isTranscribing)
  const transcribingStartedAt = useTranscriptStore((s) => s.transcribingStartedAt)
  const connectionStatus = useTranscriptStore((s) => s.connectionStatus)
  const audioLevel = useAudioStore((s) => s.level)
  const pendingServiceStart = useSessionStore((s) => s.pendingServiceStart)
  const sessionsMode = useSessionStore((s) => s.sessionsMode)
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const [showPreflight, setShowPreflight] = useState(false)

  useEffect(() => {
    if (pendingServiceStart) {
      setShowPreflight(true)
      useSessionStore.getState().clearServiceStart()
    }
  }, [pendingServiceStart])

  // Only pulse LIVE when both the session is marked live AND transcription
  // is actively running. Avoids stale red dot from orphaned sessions that
  // were resumed but never re-armed for transcription.
  const sessionLive = activeSession?.status === "live"
  const isLive = sessionLive && isTranscribing
  const workspaceMode = getWorkspaceMode({
    activeSession,
    isTranscribing,
    pendingServiceStart,
    sessionsMode,
  })
  const modeCopy = getWorkspaceModeCopy(workspaceMode)

  const handleStartServiceClick = () => {
    setShowPreflight(true)
  }

  const handleStartService = async () => {
    await startServiceFlow({ onMissingApiKey: () => setShowKeyPrompt(true) })
  }

  const handleEndService = async () => {
    const confirmed = await ask("End service? This will stop transcription and save the session.", { title: "End Service", kind: "warning" })
    if (!confirmed) return
    try {
      const session = useSessionStore.getState().activeSession

      // Stop transcription + merge audio segments into the final recording.
      if (session) {
        const { finalizeRecording } = await import("@/lib/finalize-recording")
        await finalizeRecording(session.id)
      } else {
        await invoke("stop_transcription")
      }
      useTranscriptStore.getState().setTranscribing(false)
      useTranscriptStore.getState().setPartial("")
      useTranscriptStore.getState().setConnectionStatus("disconnected")

      // End the session + fire AI summary in the background
      if (session) {
        await invoke("end_session", { id: session.id })
        useSessionStore.getState().setActiveSession(null)
        const { clearPersistedQueue } = await import("@/stores/queue-store")
        clearPersistedQueue()
        const { generateAndPersistSummary } = await import("@/lib/summarize")
        void generateAndPersistSummary(session.id)

        // Open Sessions Mode + jump to Summary tab so user sees AI output land.
        useSessionStore.getState().openSessionInMode({
          id: session.id,
          title: session.title,
          tab: "summary",
        })
      }
    } catch (e) {
      console.error("Failed to end service:", e)
    }
  }

  return (
    <div className="flex h-(--toolbar-height) items-center justify-between border-b border-border bg-card px-3">
      {/* Left side: session info */}
      <div className="flex items-center gap-2">
        {activeSession ? (
          <>
            {isLive && <LiveIndicator active={true} />}
            <div className="flex min-w-0 flex-col">
              <span className="max-w-[220px] truncate text-xs font-medium text-foreground">
                {activeSession.title}
              </span>
              <span className="hidden text-[0.625rem] text-muted-foreground sm:inline">
                {modeCopy.toolbarDetail}
              </span>
            </div>
            {isLive && transcribingStartedAt != null && (
              <ElapsedTimer startMs={transcribingStartedAt} />
            )}
            <Badge variant="outline" className="capitalize text-[0.625rem]">
              {modeCopy.toolbarLabel}
            </Badge>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{modeCopy.toolbarLabel}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {modeCopy.toolbarDetail}
            </span>
          </div>
        )}
      </div>

      {/* Right side: transcription control */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          title="Home — back to sessions landing"
          onClick={() => useSessionStore.getState().openSessions()}
        >
          <HomeIcon className="size-3.5" />
        </Button>
        {isTranscribing && audioLevel && (audioLevel.rms > 0 || audioLevel.peak > 0) && (
          <LevelMeter level={audioLevel.rms} />
        )}
        {isTranscribing ? (
          <Button
            size="sm"
            className="gap-1.5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleEndService}
          >
            <MicOffIcon className="size-3.5" />
            End Service
          </Button>
        ) : (
          <Button
            data-slot="start-service-btn"
            size="sm"
            className="gap-1.5 rounded-full"
            onClick={handleStartServiceClick}
            disabled={connectionStatus === "connecting"}
            title={connectionStatus === "connecting" ? "Connecting to STT provider (first launch can take 10–20s)" : undefined}
          >
            {connectionStatus === "connecting" ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <MicIcon className="size-3.5" />
            )}
            {connectionStatus === "connecting" ? "Connecting…" : modeCopy.primaryAction}
          </Button>
        )}
      </div>

      {/* SettingsDialog now mounted globally in App.tsx so it survives the
          landing screen (toolbar isn't rendered there). */}

      <ApiKeyPrompt
        open={showKeyPrompt}
        onOpenChange={setShowKeyPrompt}
        service="Deepgram"
        description="Live transcription needs a Deepgram API key. Add it in settings so the app can start listening."
      />

      <PreflightChecklist
        open={showPreflight}
        onOpenChange={setShowPreflight}
        onStart={handleStartService}
      />
    </div>
  )
}
