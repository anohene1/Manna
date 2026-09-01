import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { useSettingsStore } from "@/stores"
import { persistRecordAudio } from "@/stores/settings-store"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { CheckCircle2, XCircle, Mic, Key, Volume2, AlertCircle } from "lucide-react"

interface PreflightChecklistProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStart: () => void
}

/** Race a promise against a timeout so a hung permission prompt (e.g. a
 * getUserMedia mic-access dialog that never surfaces) can't stall the
 * checklist forever — falls back to `fallback` instead of hanging the UI. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then((v) => {
      clearTimeout(timer)
      resolve(v)
    }).catch(() => {
      clearTimeout(timer)
      resolve(fallback)
    })
  })
}

interface CheckItem {
  label: string
  status: "checking" | "pass" | "fail" | "warning"
  detail: string
  icon: React.ReactNode
}

export function PreflightChecklist({ open, onOpenChange, onStart }: PreflightChecklistProps) {
  const [checks, setChecks] = useState<CheckItem[]>([])
  const [ready, setReady] = useState(false)
  const recordAudio = useSettingsStore((s) => s.recordAudio)

  useEffect(() => {
    if (!open) return

    const runChecks = async () => {
      const results: CheckItem[] = []

      // Check 1: Audio device
      try {
        const devices = await invoke<Array<{ name: string }> >("get_audio_devices")
        if (devices.length > 0) {
          results.push({
            label: "Audio Input",
            status: "pass",
            detail: devices[0].name || "Microphone detected",
            icon: <Mic className="size-4" />,
          })
        } else {
          results.push({
            label: "Audio Input",
            status: "fail",
            detail: "No microphone found. Connect a mic and try again.",
            icon: <Mic className="size-4" />,
          })
        }
      } catch {
        results.push({
          label: "Audio Input",
          status: "warning",
          detail: "Could not detect audio devices",
          icon: <Mic className="size-4" />,
        })
      }

      // Check 2: API Key
      const settings = useSettingsStore.getState()
      if (settings.sttProvider === "deepgram") {
        results.push({
          label: "Deepgram API Key",
          status: settings.deepgramApiKey ? "pass" : "fail",
          detail: settings.deepgramApiKey
            ? "API key configured"
            : "No API key. Go to Settings → API Keys to add one.",
          icon: <Key className="size-4" />,
        })
      } else if (settings.sttProvider === "assemblyai") {
        results.push({
          label: "AssemblyAI API Key",
          status: settings.assemblyAiApiKey ? "pass" : "fail",
          detail: settings.assemblyAiApiKey
            ? "API key configured"
            : "No API key. Go to Settings → API Keys to add one.",
          icon: <Key className="size-4" />,
        })
      } else {
        results.push({
          label: "Whisper (Local)",
          status: "pass",
          detail: "Local speech recognition — no API key needed",
          icon: <Key className="size-4" />,
        })
      }

      // Check 3: Audio levels — actually probe the input stream for ~1s
      results.push({
        label: "Sound Check",
        status: "checking",
        detail: "Listening to mic for 1s…",
        icon: <Volume2 className="size-4" />,
      })
      setChecks([...results])

      const soundResult = await withTimeout(
        probeAudioLevel(),
        5000,
        { status: "warning", detail: "Timed out waiting for microphone (permission prompt may be hidden). You can still start — check mic settings if audio is missing." },
      )
      results[results.length - 1] = {
        label: "Sound Check",
        status: soundResult.status,
        detail: soundResult.detail,
        icon: <Volume2 className="size-4" />,
      }

      setChecks(results)
      setReady(!results.some(r => r.status === "fail"))
    }

    runChecks()
  }, [open])

  /** Capture ~1s from default mic, return pass/warn based on peak RMS. */
  const probeAudioLevel = async (): Promise<{ status: CheckItem["status"]; detail: string }> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return { status: "warning", detail: "Audio API unavailable in this environment" }
    }
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      const buf = new Float32Array(analyser.fftSize)

      const start = performance.now()
      let peakRms = 0
      while (performance.now() - start < 1000) {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        if (rms > peakRms) peakRms = rms
        await new Promise((r) => setTimeout(r, 50))
      }

      const db = peakRms > 0 ? 20 * Math.log10(peakRms) : -Infinity
      const dbStr = isFinite(db) ? `${db.toFixed(1)} dBFS` : "silent"
      if (peakRms < 0.005) {
        return { status: "warning", detail: `No signal detected (peak ${dbStr}). Check mic/console.` }
      }
      if (peakRms < 0.02) {
        return { status: "warning", detail: `Low signal (peak ${dbStr}). Raise input gain.` }
      }
      return { status: "pass", detail: `Live signal detected (peak ${dbStr}).` }
    } catch (e) {
      return { status: "warning", detail: `Mic permission denied or unavailable (${e})` }
    } finally {
      stream?.getTracks().forEach((t) => t.stop())
      await ctx?.close().catch(() => {})
    }
  }

  const statusIcon = (status: CheckItem["status"]) => {
    switch (status) {
      case "pass": return <CheckCircle2 className="size-4 text-primary" />
      case "fail": return <XCircle className="size-4 text-destructive" />
      case "warning": return <AlertCircle className="size-4 text-amber-500" />
      case "checking": return <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="text-base font-bold">Pre-Service Checklist</DialogTitle>

        <div className="mt-3 flex flex-col gap-2">
          {checks.map((check, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-xl p-3 ring-1 ${
                check.status === "pass" ? "bg-primary/5 ring-primary/15" :
                check.status === "fail" ? "bg-destructive/5 ring-destructive/15" :
                "bg-amber-500/5 ring-amber-500/15"
              }`}
            >
              <div className="mt-0.5 shrink-0 text-muted-foreground">{check.icon}</div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{check.label}</span>
                  {statusIcon(check.status)}
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2 ring-1 ring-border/40">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-semibold">Record audio</span>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Save an MP3 recording of the session for later playback.
            </p>
          </div>
          <Switch
            checked={recordAudio}
            onCheckedChange={(checked) => void persistRecordAudio(checked)}
          />
        </div>

        <div className="mt-2 rounded-lg bg-muted/30 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            Recording will start immediately. All detections and transcripts will be saved to the session.
          </p>
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 rounded-full"
            disabled={!ready}
            onClick={() => {
              onOpenChange(false)
              onStart()
            }}
          >
            {ready ? "Start Service" : "Fix Issues First"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
