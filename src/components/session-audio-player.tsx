import { useEffect, useRef } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { onAudioSeek } from "@/hooks/use-audio-seek"

interface Props {
  /** Absolute filesystem path persisted in `sermon_sessions.audio_path`. */
  audioPath: string
  /**
   * The session's `started_at` epoch milliseconds. Transcript segment
   * timestamps are stored as wall-clock ms since UNIX epoch; the audio
   * file starts at `started_at`, so seek offset = segment_ms - started_at_ms.
   */
  startedAtMs: number
}

export function SessionAudioPlayer({ audioPath, startedAtMs }: Props) {
  const ref = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return onAudioSeek((segmentMs) => {
      const el = ref.current
      if (!el) return
      const offsetSec = Math.max(0, (segmentMs - startedAtMs) / 1000)
      el.currentTime = offsetSec
      void el.play()
    })
  }, [startedAtMs])

  return (
    <audio
      ref={ref}
      controls
      preload="metadata"
      src={convertFileSrc(audioPath)}
      className="w-full"
    />
  )
}
