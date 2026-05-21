import { invoke } from "@tauri-apps/api/core"
import { useSettingsStore } from "@/stores"

export async function summarizeTranscript(transcript: string): Promise<string> {
  const apiKey = useSettingsStore.getState().claudeApiKey
  if (!apiKey) {
    throw new Error("Claude API key not configured. Add it in Settings → API Keys.")
  }
  return invoke<string>("summarize_sermon", { apiKey, transcript })
}
