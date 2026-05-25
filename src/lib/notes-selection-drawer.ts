import { create } from "zustand"

interface NotesSelectionDrawerState {
  isOpen: boolean
  planItemId: number | null
  open: (planItemId: number) => void
  close: () => void
}

export const useNotesSelectionDrawerStore = create<NotesSelectionDrawerState>((set) => ({
  isOpen: false,
  planItemId: null,
  open: (planItemId) => set({ isOpen: true, planItemId }),
  close: () => set({ isOpen: false, planItemId: null }),
}))

export function openNotesSelectionDrawer(planItemId: number): void {
  useNotesSelectionDrawerStore.getState().open(planItemId)
}
