import type { SermonSession } from "@/types/session"

export type WorkspaceMode = "explore" | "planned" | "preflight-ready" | "live" | "review"

interface WorkspaceModeInput {
  activeSession: SermonSession | null
  isTranscribing: boolean
  pendingServiceStart?: boolean
  sessionsMode: boolean
}

interface WorkspaceModeCopy {
  toolbarLabel: string
  toolbarDetail: string
  primaryAction: string
  detectionsEmptyTitle: string
  detectionsEmptyBody: string
  servicePlanEmpty: string
}

export function getWorkspaceMode({
  activeSession,
  isTranscribing,
  pendingServiceStart = false,
  sessionsMode,
}: WorkspaceModeInput): WorkspaceMode {
  if (sessionsMode) return "review"
  if (!activeSession) return "explore"
  if (activeSession.status === "completed") return "review"
  if (activeSession.status === "live" && isTranscribing) return "live"
  if (pendingServiceStart || activeSession.status === "live") return "preflight-ready"
  return "planned"
}

export function getWorkspaceModeCopy(mode: WorkspaceMode): WorkspaceModeCopy {
  switch (mode) {
    case "explore":
      return {
        toolbarLabel: "Exploring workspace",
        toolbarDetail: "No session active",
        primaryAction: "Start session",
        detectionsEmptyTitle: "No session active",
        detectionsEmptyBody: "Start a session when you are ready to listen for Bible verses in real time.",
        servicePlanEmpty: "Start a session to build a service plan.",
      }
    case "planned":
      return {
        toolbarLabel: "Planned session",
        toolbarDetail: "Preflight has not started",
        primaryAction: "Run preflight",
        detectionsEmptyTitle: "Ready for preflight",
        detectionsEmptyBody: "Run preflight when the audio feed and projection are ready.",
        servicePlanEmpty: "Add service items before starting preflight.",
      }
    case "preflight-ready":
      return {
        toolbarLabel: "Preflight ready",
        toolbarDetail: "Confirm audio before going live",
        primaryAction: "Run preflight",
        detectionsEmptyTitle: "Ready to listen",
        detectionsEmptyBody: "Start transcription after preflight to detect Bible verses in real time.",
        servicePlanEmpty: "Add service items or start listening from detections.",
      }
    case "live":
      return {
        toolbarLabel: "Live service",
        toolbarDetail: "Listening for sermon references",
        primaryAction: "End service",
        detectionsEmptyTitle: "Listening",
        detectionsEmptyBody: "Verse references will appear here as they are detected in the sermon.",
        servicePlanEmpty: "Add items as needed, or use detections and Bible search during the service.",
      }
    case "review":
      return {
        toolbarLabel: "Reviewing sessions",
        toolbarDetail: "Live controls paused",
        primaryAction: "Start session",
        detectionsEmptyTitle: "Review mode",
        detectionsEmptyBody: "Open or start a session to resume live detection.",
        servicePlanEmpty: "Open an active session to edit its service plan.",
      }
  }
}
