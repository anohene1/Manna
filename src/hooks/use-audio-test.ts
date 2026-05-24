import { useCallback, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { useTauriEvent } from "./use-tauri-event"
import type {
  AudioTestDevice,
  AudioTestMeter,
  AudioTestWaveform,
  AudioTestStopped,
} from "@/types"

/**
 * Standalone mic test pipeline. Talks to the Rust `start_audio_test` /
 * `stop_audio_test` commands and surfaces the real cpal meter + waveform —
 * NOT the WebKit `getUserMedia` path. The two can disagree (different device
 * routing, different permission scopes), so this hook is the only honest
 * answer to "is the app actually hearing this mic?".
 */
export function useAudioTest() {
  const [running, setRunning] = useState(false)
  const [device, setDevice] = useState<AudioTestDevice | null>(null)
  const [meter, setMeter] = useState<AudioTestMeter | null>(null)
  const [waveform, setWaveform] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  useTauriEvent<AudioTestDevice>("audio_test_device", (d) => {
    setDevice(d)
  })

  useTauriEvent<AudioTestMeter>("audio_test_meter", (m) => {
    setMeter(m)
  })

  useTauriEvent<AudioTestWaveform>("audio_test_waveform", (w) => {
    setWaveform(w.samples)
  })

  useTauriEvent<AudioTestStopped>("audio_test_stopped", (s) => {
    setRunning(false)
    if (s.reason !== "user_stop") {
      setError(s.reason)
    }
  })

  const start = useCallback(
    async (deviceId: string | null, gain: number) => {
      setError(null)
      try {
        await invoke("start_audio_test", { deviceId, gain })
        setRunning(true)
      } catch (e) {
        setError(String(e))
      }
    },
    []
  )

  const stop = useCallback(async () => {
    try {
      await invoke("stop_audio_test")
    } catch (e) {
      setError(String(e))
    }
    setRunning(false)
  }, [])

  /**
   * Record `durationMs` of raw audio independently of the live meter loop —
   * runs its own short-lived cpal capture in the backend, returns a Data URL
   * containing a 16 kHz mono WAV that can be fed straight to `<audio src>`.
   * Resolves with `null` on failure (error state populated separately).
   */
  const recordClip = useCallback(
    async (
      deviceId: string | null,
      gain: number,
      durationMs: number,
    ): Promise<string | null> => {
      try {
        const b64 = await invoke<string>("record_audio_clip", {
          deviceId,
          gain,
          durationMs,
        })
        return `data:audio/wav;base64,${b64}`
      } catch (e) {
        setError(String(e))
        return null
      }
    },
    []
  )

  return {
    running,
    device,
    meter,
    waveform,
    error,
    start,
    stop,
    recordClip,
  }
}
