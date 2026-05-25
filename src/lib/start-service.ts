import { invoke } from "@tauri-apps/api/core"
import {
  useSessionStore,
  useSettingsStore,
  useTranscriptStore,
} from "@/stores"

interface StartServiceOptions {
  onMissingApiKey?: () => void
}

/**
 * Auto-creates an active live session if none exists, then starts transcription
 * using the user's configured STT provider. Shared between the toolbar's
 * "Start Service" button and the sessions-landing flow.
 */
export async function startServiceFlow(opts: StartServiceOptions = {}): Promise<void> {
  try {
    let active = useSessionStore.getState().activeSession
    if (!active) {
      const now = new Date()
      const date = now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      const time = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      const session = await invoke<any>("create_session", {
        request: {
          title: `${date} — ${time}`,
          date: now.toISOString().split("T")[0],
        },
      })
      active = session
      useSessionStore.getState().setActiveSession(session)
    }

    // Promote the session from "planned" to "live" — this stamps startedAt,
    // which the elapsed timer keys off. We only do this here so the timer
    // begins precisely when the operator confirms Start Service.
    if (active && active.status !== "live") {
      const started = await invoke<any>("start_session", { id: active.id })
      useSessionStore.getState().setActiveSession(started)
    }

    useTranscriptStore.getState().setConnectionStatus("connecting")
    const settings = useSettingsStore.getState()
    const providerKey =
      settings.sttProvider === "deepgram"
        ? (settings.deepgramApiKey ?? "")
        : settings.sttProvider === "assemblyai"
          ? (settings.assemblyAiApiKey ?? "")
          : ""
    await invoke("start_transcription", {
      apiKey: providerKey,
      deviceId: settings.audioDeviceId,
      gain: settings.gain,
      provider: settings.sttProvider,
    })
  } catch (e) {
    const errorMsg = String(e)
    useTranscriptStore.getState().setConnectionStatus("error")
    if (errorMsg.includes("No Deepgram API key")) {
      opts.onMissingApiKey?.()
    } else {
      alert(errorMsg)
    }
  }
}
