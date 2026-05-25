import { create } from "zustand"
import type { PlanItem } from "@/types"

interface AnnouncementDialogState {
  isOpen: boolean
  /** When set, the dialog acts as an editor for this plan-item announcement
   *  instead of a live "send now" surface. */
  editingItem: PlanItem | null
  openAnnouncement: () => void
  openAnnouncementForEdit: (item: PlanItem) => void
  closeAnnouncement: () => void
}

export const useAnnouncementDialogStore = create<AnnouncementDialogState>((set) => ({
  isOpen: false,
  editingItem: null,
  openAnnouncement: () => set({ isOpen: true, editingItem: null }),
  openAnnouncementForEdit: (item) => set({ isOpen: true, editingItem: item }),
  closeAnnouncement: () => set({ isOpen: false, editingItem: null }),
}))
