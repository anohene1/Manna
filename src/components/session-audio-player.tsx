import { useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { onAudioSeek } from "@/hooks/use-audio-seek"

interface Props {
  /** Session id — audio bytes are fetched over IPC and played from a Blob. */
  sessionId: number
  /**
   * The session's `started_at` epoch milliseconds. Transcript segment
   * timestamps are stored as wall-clock ms since UNIX epoch; the audio
   * file starts at `started_at`, so seek offset = segment_ms - started_at_ms.
   */
  startedAtMs: number
}

/**
 * Plays a session recording from an in-memory Blob URL.
 *
 * We deliberately do NOT use `convertFileSrc()` / the `asset:` protocol: on
 * macOS WKWebView the asset protocol mishandles media range requests, so
 * seeking a longer recording re-reads from byte 0 and crashes the WebView
 * renderer (tauri-apps/tauri#6375, #4826). Fetching the bytes once and serving
 * them as a `blob:` URL lets the media element seek in-memory — no custom-scheme
 * range requests, no crash.
 */
export function SessionAudioPlayer({ sessionId, startedAtMs }: Props) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch audio bytes once and build a Blob URL. Revoke on unmount / change.
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    void invoke<ArrayBuffer>("read_session_audio", { sessionId })
      .then((buf) => {
        if (cancelled) return
        const blob = new Blob([buf], { type: "audio/mpeg" })
        url = URL.createObjectURL(blob)
        setBlobUrl(url)
      })
      .catch((e) => {
        if (!cancelled) setError(typeof e === "string" ? e : "Failed to load audio")
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [sessionId])

  // Click-to-seek from transcript segments.
  useEffect(() => {
    return onAudioSeek((segmentMs) => {
      const el = ref.current
      if (!el) return
      const offsetSec = Math.max(0, (segmentMs - startedAtMs) / 1000)
      if (!Number.isFinite(offsetSec)) return
      el.currentTime = offsetSec
      void el.play()
    })
  }, [startedAtMs])

  if (error) {
    return <p className="text-xs text-muted-foreground">Audio unavailable: {error}</p>
  }
  if (!blobUrl) {
    return <p className="text-xs text-muted-foreground">Loading audio…</p>
  }

  return <audio ref={ref} controls preload="metadata" src={blobUrl} className="w-full" />
}
