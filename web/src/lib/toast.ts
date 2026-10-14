import { create } from 'zustand'

export interface ToastInput {
  message: string
  action?: { label: string; onClick: () => void }
  /** ms; defaults to 5000. */
  duration?: number
  tone?: 'default' | 'danger'
}

interface ToastItem extends ToastInput {
  id: number
}

interface ToastState {
  toasts: ToastItem[]
  push: (t: ToastInput) => number
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Shows a notification at the bottom right. Returns its id. */
export const toast = (t: ToastInput) => useToasts.getState().push(t)
