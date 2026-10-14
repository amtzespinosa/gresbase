import { create } from 'zustand'

/** Which overlay is open: the ⌘K palette or the keyboard shortcuts help. */
export const usePalette = create<{
  open: 'palette' | 'help' | null
  setOpen: (open: 'palette' | 'help' | null) => void
}>()((set) => ({ open: null, setOpen: (open) => set({ open }) }))
