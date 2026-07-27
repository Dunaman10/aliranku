import { create } from 'zustand'
import type { Tx } from './db'

export type Tab = 'home' | 'txs' | 'reports' | 'settings'
export type Theme = 'system' | 'light' | 'dark'

const THEME_KEY = 'aliranku-theme'

function applyTheme(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

interface UIState {
  tab: Tab
  setTab: (t: Tab) => void
  /** Sheet tambah/edit transaksi */
  sheet: { open: boolean; editTx?: Tx }
  openAdd: () => void
  openEdit: (tx: Tx) => void
  closeSheet: () => void
  theme: Theme
  setTheme: (t: Theme) => void
  /** Pesan singkat non-blocking (mis. peringatan budget) */
  toast: string | null
  showToast: (msg: string) => void
  /** Status menyembunyikan nominal saldo / angka keuangan */
  hideAmounts: boolean
  toggleHideAmounts: () => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

const HIDE_AMOUNTS_KEY = 'aliranku-hide-amounts'

export const useUI = create<UIState>((set) => ({
  tab: 'home',
  setTab: (tab) => set({ tab }),
  sheet: { open: false },
  openAdd: () => set({ sheet: { open: true } }),
  openEdit: (tx) => set({ sheet: { open: true, editTx: tx } }),
  closeSheet: () => set({ sheet: { open: false } }),
  theme: (localStorage.getItem(THEME_KEY) as Theme) || 'system',
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
  toast: null,
  showToast: (msg) => {
    clearTimeout(toastTimer)
    set({ toast: msg })
    toastTimer = setTimeout(() => set({ toast: null }), 4500)
  },
  hideAmounts: localStorage.getItem(HIDE_AMOUNTS_KEY) === 'true',
  toggleHideAmounts: () =>
    set((state) => {
      const next = !state.hideAmounts
      localStorage.setItem(HIDE_AMOUNTS_KEY, String(next))
      return { hideAmounts: next }
    }),
}))

// Ikuti perubahan tema sistem saat mode "system"
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => applyTheme(useUI.getState().theme))
