type SeekListener = (timestampMs: number) => void

const listeners = new Set<SeekListener>()

/** Emit a seek event consumed by `SessionAudioPlayer`. */
export function emitAudioSeek(timestampMs: number) {
  listeners.forEach((fn) => fn(timestampMs))
}

/** Subscribe to seek events. Returns an unsubscribe fn. */
export function onAudioSeek(fn: SeekListener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
