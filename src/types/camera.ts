export type VideoFit = "cover" | "contain"

export interface LocalVideoInputConfig {
  type: "local"
  deviceId: string
  label: string
}

export interface NdiVideoInputConfig {
  type: "ndi"
  sourceName: string
  urlAddress: string | null
}

export type VideoInputConfig = LocalVideoInputConfig | NdiVideoInputConfig

export type CameraConnectionState =
  "idle" | "connecting" | "connected" | "disconnected" | "error"

export interface CameraStatus {
  active: boolean
  connection: CameraConnectionState
  error: string | null
}

export interface CameraBroadcastConfig {
  active: boolean
  source: VideoInputConfig | null
  fit: VideoFit
  mirrored: boolean
  lowerThirdTheme: import("./broadcast").BroadcastTheme
  churchName?: string
  logoUrl?: string
}

export interface NdiInputSource {
  name: string
  urlAddress: string | null
}

export interface NdiInputStatus {
  active: boolean
  connected: boolean
  sourceName: string | null
  width: number | null
  height: number | null
  fps: number | null
  sequence: number
  error: string | null
}
