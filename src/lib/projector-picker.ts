import { create } from "zustand"

export interface PickerMonitor {
  name: string
  width: number
  height: number
  x: number
  y: number
  scale: number
  is_primary: boolean
}

interface PickerState {
  isOpen: boolean
  monitors: PickerMonitor[]
  resolver: ((idx: number | null) => void) | null
  open: (monitors: PickerMonitor[]) => Promise<number | null>
  setMonitors: (monitors: PickerMonitor[]) => void
  pick: (idx: number) => void
  cancel: () => void
}

export const useProjectorPicker = create<PickerState>((set, get) => ({
  isOpen: false,
  monitors: [],
  resolver: null,
  open: (monitors) =>
    new Promise<number | null>((resolve) => {
      // If a previous picker is still pending (rapid double-click on "Start
      // session", re-render race), resolve the old one with null first so its
      // awaiting promise unblocks instead of leaking forever.
      const prev = get().resolver
      if (prev) prev(null)
      set({ isOpen: true, monitors, resolver: resolve })
    }),
  setMonitors: (monitors) => set({ monitors }),
  pick: (idx) => {
    get().resolver?.(idx)
    set({ isOpen: false, monitors: [], resolver: null })
  },
  cancel: () => {
    get().resolver?.(null)
    set({ isOpen: false, monitors: [], resolver: null })
  },
}))
