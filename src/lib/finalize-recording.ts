import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

/** Race a promise against a timeout so a stuck IPC call (e.g. a command
 * waiting on a busy backend lock) can't stall End Session forever. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[recording] ${label} timed out after ${ms}ms`)
      resolve(undefined)
    }, ms)
    promise.then((v) => {
      clearTimeout(timer)
      resolve(v)
    }).catch((e) => {
      clearTimeout(timer)
      console.warn(`[recording] ${label} failed`, e)
      resolve(undefined)
    })
  })
}

/**
 * Stop transcription and concatenate the session's audio segments into the
 * final `audio.mp3`.
 *
 * Recording is written as one segment file per `start_transcription` (so a
 * reload/restart never truncates prior audio). On End Session we stop the
 * capture thread, wait for it to flush + close its current segment (signalled
 * by the `recording_segment_finalized` event), then ask the backend to
 * concatenate all segments into a single file.
 */
export async function finalizeRecording(sessionId: number): Promise<void> {
  try {
    // Arm the listener BEFORE stopping so we don't miss the event.
    const finalized = new Promise<void>((resolve) => {
      let done = false
      const settle = () => {
        if (done) return
        done = true
        resolve()
      }
      void listen("recording_segment_finalized", () => settle()).then((unlisten) => {
        // Cap the wait — if recording was off, the event never fires.
        setTimeout(() => {
          settle()
          unlisten()
        }, 2500)
      })
    })

    await withTimeout(invoke("stop_transcription"), 3000, "stop_transcription")
    await finalized
    await withTimeout(invoke("finalize_session_audio", { sessionId }), 5000, "finalize_session_audio")
  } catch (e) {
    console.warn("[recording] finalize failed", e)
  }
}

/**
 * Lazily concatenate any leftover segments for a session (e.g. the app was
 * reloaded or crashed before End Session, so segments exist but no merged
 * `audio.mp3`). Safe no-op when already finalized. Returns the final audio
 * path if audio exists.
 */
export async function ensureSessionAudioMerged(
  sessionId: number,
): Promise<string | null> {
  try {
    return await invoke<string | null>("finalize_session_audio", { sessionId })
  } catch (e) {
    console.warn("[recording] lazy merge failed", e)
    return null
  }
}
