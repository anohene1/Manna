import { create } from "zustand"
import type { TranscriptSegment } from "@/types"

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error"

interface TranscriptState {
  segments: TranscriptSegment[]
  currentPartial: string
  isTranscribing: boolean
  /** Epoch ms when transcription most recently started. Null when not running.
   *  Used by the toolbar elapsed timer so the clock starts on Start Service,
   *  not on session creation. */
  transcribingStartedAt: number | null
  connectionStatus: ConnectionStatus

  addSegment: (segment: TranscriptSegment) => void
  setPartial: (text: string) => void
  setTranscribing: (transcribing: boolean) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  clearTranscript: () => void
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  segments: [],
  currentPartial: "",
  isTranscribing: false,
  transcribingStartedAt: null,
  connectionStatus: "disconnected",

  addSegment: (segment) =>
    set((state) => ({
      segments: [...state.segments, segment],
      currentPartial: "",
    })),
  setPartial: (currentPartial) => set({ currentPartial }),
  setTranscribing: (isTranscribing) =>
    set((state) => ({
      isTranscribing,
      transcribingStartedAt: isTranscribing
        ? state.transcribingStartedAt ?? Date.now()
        : null,
    })),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  clearTranscript: () => set({ segments: [], currentPartial: "" }),
}))
