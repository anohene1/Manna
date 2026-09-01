import { useEffect } from "react"
import { listen } from "@tauri-apps/api/event"
import { useBroadcastStore } from "@/stores/broadcast-store"
import type { CameraConnectionState } from "@/types"

export function useCameraEvents(): void {
  useEffect(() => {
    const statusListener = listen<{
      connection: CameraConnectionState
      error?: string | null
    }>("broadcast:camera-status:main", ({ payload }) => {
      useBroadcastStore
        .getState()
        .setCameraStatus(payload.connection, payload.error ?? null)
    })
    const previewListener = listen<{ dataUrl: string }>(
      "broadcast:program-preview:main",
      ({ payload }) => {
        useBroadcastStore.getState().setProgramPreviewUrl(payload.dataUrl)
      }
    )
    return () => {
      void statusListener.then((unlisten) => unlisten())
      void previewListener.then((unlisten) => unlisten())
    }
  }, [])
}
