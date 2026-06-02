import { describe, expect, it } from "vitest"
import { getWorkspaceMode, getWorkspaceModeCopy } from "./workspace-mode"
import type { SermonSession } from "@/types/session"

function session(status: SermonSession["status"]): SermonSession {
  return {
    id: 1,
    title: "Sunday service",
    speaker: null,
    date: "2026-06-01",
    seriesName: null,
    tags: [],
    startedAt: status === "planned" ? null : "2026-06-01T10:00:00.000Z",
    endedAt: status === "completed" ? "2026-06-01T11:00:00.000Z" : null,
    status,
    plannedScriptures: [],
    summary: null,
    audioPath: null,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:00:00.000Z",
  }
}

describe("getWorkspaceMode", () => {
  it("reports review while sessions mode is open", () => {
    expect(getWorkspaceMode({ activeSession: session("live"), isTranscribing: true, sessionsMode: true })).toBe("review")
  })

  it("reports explore when the workspace has no active session", () => {
    expect(getWorkspaceMode({ activeSession: null, isTranscribing: false, sessionsMode: false })).toBe("explore")
  })

  it("distinguishes planned from preflight-ready", () => {
    expect(getWorkspaceMode({ activeSession: session("planned"), isTranscribing: false, sessionsMode: false })).toBe("planned")
    expect(getWorkspaceMode({ activeSession: session("planned"), isTranscribing: false, pendingServiceStart: true, sessionsMode: false })).toBe("preflight-ready")
  })

  it("keeps a live session in preflight-ready until transcription is active", () => {
    expect(getWorkspaceMode({ activeSession: session("live"), isTranscribing: false, sessionsMode: false })).toBe("preflight-ready")
    expect(getWorkspaceMode({ activeSession: session("live"), isTranscribing: true, sessionsMode: false })).toBe("live")
  })
})

describe("getWorkspaceModeCopy", () => {
  it("returns operator-facing toolbar labels", () => {
    expect(getWorkspaceModeCopy("explore").toolbarLabel).toBe("Exploring workspace")
    expect(getWorkspaceModeCopy("planned").primaryAction).toBe("Run preflight")
    expect(getWorkspaceModeCopy("preflight-ready").primaryAction).toBe("Run preflight")
    expect(getWorkspaceModeCopy("live").primaryAction).toBe("End service")
  })
})
