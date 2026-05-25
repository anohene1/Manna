import { create } from "zustand"
import type { SermonSession } from "@/types/session"

export type PendingSessionTab = "detections" | "transcript" | "summary" | "stats"

interface SessionState {
  activeSession: SermonSession | null
  sessions: SermonSession[]
  isLoading: boolean
  workspaceUnlocked: boolean
  /**
   * True when Sessions Mode (full-screen history browser) is open as an
   * overlay over the main workspace. In-memory only.
   */
  sessionsMode: boolean
  /**
   * When non-null, Sessions Mode renders the SessionDetail for this row;
   * otherwise it renders the landing list.
   */
  sessionsView: { id: number; title: string; tab?: PendingSessionTab } | null
  /**
   * Set when a fresh session is created from the landing page; tells the
   * workspace toolbar to immediately open the preflight checklist so the
   * operator can kick off transcription without an extra click.
   */
  pendingServiceStart: boolean
}

interface SessionActions {
  setActiveSession: (session: SermonSession | null) => void
  setSessions: (sessions: SermonSession[]) => void
  updateActiveSession: (updates: Partial<SermonSession>) => void
  setLoading: (loading: boolean) => void
  unlockWorkspace: () => void
  lockWorkspace: () => void
  // Sessions Mode
  openSessions: () => void
  closeSessions: () => void
  openSessionInMode: (req: { id: number; title: string; tab?: PendingSessionTab }) => void
  clearSessionInMode: () => void
  requestServiceStart: () => void
  clearServiceStart: () => void
}

export const useSessionStore = create<SessionState & SessionActions>((set) => ({
  activeSession: null,
  sessions: [],
  isLoading: false,
  workspaceUnlocked: false,
  sessionsMode: false,
  sessionsView: null,
  pendingServiceStart: false,
  setActiveSession: (session) =>
    set((state) => ({
      activeSession: session,
      // Starting a session implicitly unlocks the workspace.
      workspaceUnlocked: session ? true : state.workspaceUnlocked,
    })),
  setSessions: (sessions) => set({ sessions }),
  updateActiveSession: (updates) =>
    set((state) => ({
      activeSession: state.activeSession
        ? { ...state.activeSession, ...updates }
        : null,
    })),
  setLoading: (isLoading) => set({ isLoading }),
  unlockWorkspace: () => set({ workspaceUnlocked: true }),
  lockWorkspace: () => set({ workspaceUnlocked: false }),
  openSessions: () => set({ sessionsMode: true, sessionsView: null }),
  closeSessions: () => set({ sessionsMode: false, sessionsView: null }),
  openSessionInMode: (sessionsView) => set({ sessionsMode: true, sessionsView }),
  clearSessionInMode: () => set({ sessionsView: null }),
  requestServiceStart: () => set({ pendingServiceStart: true }),
  clearServiceStart: () => set({ pendingServiceStart: false }),
}))
