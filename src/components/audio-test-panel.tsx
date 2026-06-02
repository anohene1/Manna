import { useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { useAudioTest } from "@/hooks/use-audio-test"
import { useSettingsStore } from "@/stores"
import { useTauriEvent } from "@/hooks/use-tauri-event"
import { Button } from "@/components/ui/button"
import {
  ActivityIcon,
  MicIcon,
  AlertTriangleIcon,
  CircleIcon,
  Loader2Icon,
  PlayIcon,
  TypeIcon,
} from "lucide-react"

interface AudioTestPanelProps {
  deviceId: string | null
  gain: number
}

/**
 * Live mic test panel. Shows the actual cpal device that's open, real-time
 * dBFS meter with peak hold, and a rolling waveform — everything sourced
 * from the same audio path the STT pipeline uses, so what you see here is
 * what the app will hear during a service.
 */
export function AudioTestPanel({ deviceId, gain }: AudioTestPanelProps) {
  const { running, device, meter, waveform, error, start, stop, recordClip } =
    useAudioTest()

  // Auto-stop on unmount so the cpal stream doesn't dangle if the user
  // closes the settings dialog mid-test.
  useEffect(() => {
    return () => {
      if (running) {
        void stop()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Mic Test
          </span>
        </div>
        {running ? (
          <Button size="sm" variant="outline" className="h-7 rounded-full" onClick={() => void stop()}>
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 rounded-full"
            onClick={() => void start(deviceId, gain)}
          >
            <MicIcon className="mr-1 size-3" />
            Start
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <DeviceLine running={running} device={device} requestedId={deviceId} />

      <LevelMeter meter={meter} running={running} />

      <WaveformView samples={waveform} running={running} />

      <RecordPlayback deviceId={deviceId} gain={gain} recordClip={recordClip} />

      <SttPreview />

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Meter + waveform read the same cpal stream the transcriber uses. If
        the meter stays silent here, the app won't hear your sermon — even if
        other apps (Voice Memos, browser tabs) can.
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Device line                                                               */
/* -------------------------------------------------------------------------- */

function DeviceLine({
  running,
  device,
  requestedId,
}: {
  running: boolean
  device: ReturnType<typeof useAudioTest>["device"]
  requestedId: string | null
}) {
  if (!running && !device) {
    return (
      <div className="text-[11px] text-muted-foreground">
        Click <span className="font-medium">Start</span> to probe the live mic input.
      </div>
    )
  }
  if (!device) {
    return (
      <div className="text-[11px] text-muted-foreground">Opening device…</div>
    )
  }

  const mismatchedFallback =
    device.fell_back && requestedId !== null && requestedId !== device.actual_name

  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted/40 px-2 py-1.5 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">cpal opened</span>
        <span className="truncate font-mono font-medium" title={device.actual_name}>
          {device.actual_name}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span>
          {device.sample_rate.toLocaleString()} Hz · {device.channels} ch
        </span>
        {mismatchedFallback && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            fell back (requested: {requestedId})
          </span>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Level meter                                                               */
/* -------------------------------------------------------------------------- */

const FLOOR_DB = -60

function LevelMeter({
  meter,
  running,
}: {
  meter: ReturnType<typeof useAudioTest>["meter"]
  running: boolean
}) {
  // Peak hold: decays linearly back to current peak over ~1s. Held in a ref
  // so re-renders don't reset the decay timer.
  const peakHoldRef = useRef<number>(FLOOR_DB)
  const peakDecayRef = useRef<number>(performance.now())

  const rmsDb = meter?.rms_db ?? FLOOR_DB
  const peakDb = meter?.peak_db ?? FLOOR_DB

  const now = performance.now()
  const dt = (now - peakDecayRef.current) / 1000
  peakDecayRef.current = now
  if (peakDb > peakHoldRef.current) {
    peakHoldRef.current = peakDb
  } else {
    peakHoldRef.current -= dt * 30 // 30 dB/sec decay
    if (peakHoldRef.current < peakDb) peakHoldRef.current = peakDb
    if (peakHoldRef.current < FLOOR_DB) peakHoldRef.current = FLOOR_DB
  }

  const rmsPct = dbToPct(rmsDb)
  const peakPct = dbToPct(peakDb)
  const holdPct = dbToPct(peakHoldRef.current)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-3 overflow-hidden rounded-full bg-muted/60">
        {/* Color zones — visual scale */}
        <div className="absolute inset-y-0 left-0 right-0 flex">
          <div className="h-full" style={{ width: "70%" }} />
          <div className="h-full" style={{ width: "20%" }} />
          <div className="h-full" style={{ width: "10%" }} />
        </div>
        {/* RMS fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500 transition-[width] duration-75"
          style={{ width: `${rmsPct}%`, opacity: running ? 1 : 0.3 }}
        />
        {/* Instant peak marker */}
        <div
          className="absolute inset-y-0 w-[2px] bg-foreground/80"
          style={{ left: `calc(${peakPct}% - 1px)`, opacity: running ? 0.9 : 0 }}
        />
        {/* Peak hold marker */}
        <div
          className="absolute inset-y-0 w-[1px] bg-foreground/60"
          style={{ left: `calc(${holdPct}% - 0.5px)`, opacity: running ? 0.7 : 0 }}
        />
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>RMS {formatDb(rmsDb)}</span>
        <span>Peak {formatDb(peakDb)}</span>
        <span>Hold {formatDb(peakHoldRef.current)}</span>
      </div>
    </div>
  )
}

function dbToPct(db: number): number {
  if (db <= FLOOR_DB) return 0
  if (db >= 0) return 100
  return ((db - FLOOR_DB) / -FLOOR_DB) * 100
}

function formatDb(db: number): string {
  if (db <= FLOOR_DB + 0.5) return "−∞ dB"
  return `${db.toFixed(1)} dB`
}

/* -------------------------------------------------------------------------- */
/*  Waveform canvas — rolling 2s window                                       */
/* -------------------------------------------------------------------------- */

const WAVE_WINDOW = 1024 // total points kept on screen

function WaveformView({ samples, running }: { samples: number[]; running: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const bufferRef = useRef<number[]>(new Array(WAVE_WINDOW).fill(0))

  // Append new samples to rolling buffer
  useEffect(() => {
    if (!samples.length) return
    const buf = bufferRef.current
    buf.splice(0, samples.length)
    buf.push(...samples)
    if (buf.length > WAVE_WINDOW) {
      buf.splice(0, buf.length - WAVE_WINDOW)
    }
    drawWaveform(canvasRef.current, buf, running)
  }, [samples, running])

  // Re-draw when running flips so muted-state styling updates
  useEffect(() => {
    drawWaveform(canvasRef.current, bufferRef.current, running)
  }, [running])

  return (
    <div className="relative h-20 overflow-hidden rounded-md bg-muted/40">
      <canvas
        ref={canvasRef}
        width={512}
        height={80}
        className="h-full w-full"
      />
      {!running && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground/70">
          idle
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Record + Playback                                                         */
/* -------------------------------------------------------------------------- */

function RecordPlayback({
  deviceId,
  gain,
  recordClip,
}: {
  deviceId: string | null
  gain: number
  recordClip: (
    deviceId: string | null,
    gain: number,
    durationMs: number,
  ) => Promise<string | null>
}) {
  const [state, setState] = useState<"idle" | "recording" | "ready">("idle")
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const DURATION_MS = 3000

  const handleRecord = async () => {
    setState("recording")
    setClipUrl(null)
    const url = await recordClip(deviceId, gain, DURATION_MS)
    if (url) {
      setClipUrl(url)
      setState("ready")
    } else {
      setState("idle")
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Record &amp; Playback
        </span>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={state === "recording" ? "secondary" : "outline"}
            className="h-7 rounded-full"
            disabled={state === "recording"}
            onClick={() => void handleRecord()}
          >
            {state === "recording" ? (
              <>
                <Loader2Icon className="mr-1 size-3 animate-spin" />
                Recording 3s…
              </>
            ) : (
              <>
                <CircleIcon className="mr-1 size-3 fill-current text-red-500" />
                Record 3s
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full"
            disabled={!clipUrl}
            onClick={() => void audioRef.current?.play()}
          >
            <PlayIcon className="mr-1 size-3" />
            Play
          </Button>
        </div>
      </div>
      {clipUrl && (
        <audio ref={audioRef} src={clipUrl} controls className="h-8 w-full" />
      )}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Captures 3s from the cpal pipeline at 16 kHz mono. Press play to hear
        exactly what the transcriber would receive.
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Live STT preview                                                          */
/* -------------------------------------------------------------------------- */

const STT_TEST_MS = 5000

function SttPreview() {
  const sttProvider = useSettingsStore((s) => s.sttProvider)
  const deepgramApiKey = useSettingsStore((s) => s.deepgramApiKey)
  const assemblyAiApiKey = useSettingsStore((s) => s.assemblyAiApiKey)
  const audioDeviceId = useSettingsStore((s) => s.audioDeviceId)
  const gainStore = useSettingsStore((s) => s.gain)

  const [running, setRunning] = useState(false)
  const [partial, setPartial] = useState("")
  const [finals, setFinals] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(0)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useTauriEvent<{ text: string; is_final: boolean }>("transcript_partial", (p) => {
    if (running) setPartial(p.text)
  })
  useTauriEvent<{ text: string; is_final: boolean }>("transcript_final", (p) => {
    if (running && p.text) {
      setFinals((prev) => [...prev, p.text])
      setPartial("")
    }
  })
  useTauriEvent<string>("stt_error", (msg) => {
    if (running) setErr(msg)
  })

  const apiKey =
    sttProvider === "deepgram"
      ? (deepgramApiKey ?? "")
      : sttProvider === "assemblyai"
        ? (assemblyAiApiKey ?? "")
        : ""

  const missingKey =
    (sttProvider === "deepgram" || sttProvider === "assemblyai") && !apiKey

  const stop = async () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
    if (tickTimerRef.current) clearInterval(tickTimerRef.current)
    stopTimerRef.current = null
    tickTimerRef.current = null
    try {
      await invoke("stop_transcription")
    } catch (e) {
      setErr(String(e))
    }
    setRunning(false)
    setRemaining(0)
  }

  const start = async () => {
    setErr(null)
    setPartial("")
    setFinals([])
    setRunning(true)
    setRemaining(STT_TEST_MS / 1000)
    try {
      await invoke("start_transcription", {
        apiKey,
        provider: sttProvider,
        deviceId: audioDeviceId,
        gain: gainStore,
      })
    } catch (e) {
      setErr(String(e))
      setRunning(false)
      return
    }
    stopTimerRef.current = setTimeout(() => void stop(), STT_TEST_MS)
    tickTimerRef.current = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1))
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
      if (tickTimerRef.current) clearInterval(tickTimerRef.current)
      if (running) {
        void invoke("stop_transcription").catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const display = [...finals, partial].filter(Boolean).join(" ")

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Live STT Preview (5s)
        </span>
        {running ? (
          <Button size="sm" variant="outline" className="h-7 rounded-full" onClick={() => void stop()}>
            Stop ({remaining}s)
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 rounded-full"
            disabled={missingKey}
            onClick={() => void start()}
          >
            <TypeIcon className="mr-1 size-3" />
            Test 5s
          </Button>
        )}
      </div>

      {missingKey && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          No {sttProvider} API key configured. Add one in API Keys.
        </p>
      )}

      {err && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="min-h-[44px] rounded-md bg-background/60 px-2 py-1.5 text-[11px] leading-relaxed">
        {display ? (
          <span>
            {finals.join(" ")}{" "}
            {partial && <span className="text-muted-foreground">{partial}</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {running ? "Listening…" : "Speak after pressing Test."}
          </span>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Provider: <span className="font-medium">{sttProvider}</span>. Runs the
        full transcription pipeline for 5s — confirms STT actually hears the
        mic, not just cpal.
      </p>
    </div>
  )
}

function drawWaveform(
  canvas: HTMLCanvasElement | null,
  buffer: number[],
  running: boolean
) {
  if (!canvas) return
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const { width, height } = canvas
  const mid = height / 2

  ctx.clearRect(0, 0, width, height)

  // Center line
  ctx.strokeStyle = "rgba(120,120,120,0.3)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, mid)
  ctx.lineTo(width, mid)
  ctx.stroke()

  if (!running) return

  // Filled waveform path
  const step = width / buffer.length
  ctx.fillStyle = "rgba(16,185,129,0.35)" // emerald-500 / 35%
  ctx.beginPath()
  ctx.moveTo(0, mid)
  for (let i = 0; i < buffer.length; i++) {
    const y = mid - buffer[i] * (mid - 2)
    ctx.lineTo(i * step, y)
  }
  for (let i = buffer.length - 1; i >= 0; i--) {
    const y = mid + buffer[i] * (mid - 2)
    ctx.lineTo(i * step, y)
  }
  ctx.closePath()
  ctx.fill()

  // Outline
  ctx.strokeStyle = "rgb(16,185,129)"
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < buffer.length; i++) {
    const y = mid - buffer[i] * (mid - 2)
    if (i === 0) ctx.moveTo(i * step, y)
    else ctx.lineTo(i * step, y)
  }
  ctx.stroke()
}
