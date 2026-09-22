import { create } from 'zustand'
import { getSetting, setSetting } from '../db'
import {
  calculatePortfolio,
  clearCreds as libClearCreds,
  fetchPortfolio,
  fetchRawBalances,
  fetchSummaries,
  loadBuyPrices,
  loadCreds,
  saveBuyPrice,
  syncAccountBalance,
  type IndodaxCreds,
  type IndodaxSummaries,
  type Portfolio,
  type RawBalances,
} from './indodax'

interface IndodaxState {
  connected: boolean | null
  isLive: boolean
  loading: boolean
  portfolio: Portfolio | null
  lastSync: number | null
  error: string | null

  // Actions
  init: () => Promise<void>
  refreshNow: () => Promise<void>
  updateBuyPrice: (code: string, price: number) => Promise<void>
  disconnect: () => Promise<void>
  setConnectedManual: (c: boolean) => void
}

let tickerTimer: ReturnType<typeof setInterval> | null = null
let balanceTimer: ReturnType<typeof setInterval> | null = null
let activeCreds: IndodaxCreds | null = null
let currentRawBalances: RawBalances | null = null
let currentSummaries: IndodaxSummaries | null = null
let isInitialized = false

function stopAllTimers() {
  if (tickerTimer) {
    clearInterval(tickerTimer)
    tickerTimer = null
  }
  if (balanceTimer) {
    clearInterval(balanceTimer)
    balanceTimer = null
  }
}

function startAllTimers(set: (partial: Partial<IndodaxState>) => void) {
  stopAllTimers()
  if (!activeCreds) return

  // Ticker public API setiap 15 detik
  tickerTimer = setInterval(() => {
    runTickersOnly(set)
  }, 15_000)


  // Saldo privat TAPI setiap 60 detik
  balanceTimer = setInterval(() => {
    runBalancesOnly(set)
  }, 60_000)

  set({ isLive: true })
}

async function runTickersOnly(
  set: (partial: Partial<IndodaxState>) => void,
) {
  try {
    const raw =
      currentRawBalances ||
      (await getSetting<RawBalances>('indodaxRawBalances'))
    if (!raw || Object.keys(raw.crypto).length === 0) return

    const [summaries, buyPrices] = await Promise.all([
      fetchSummaries(),
      loadBuyPrices(),
    ])
    currentSummaries = summaries

    const updated = calculatePortfolio(raw, summaries, buyPrices)
    const now = Date.now()

    set({ portfolio: updated, lastSync: now, isLive: true })
    await setSetting('indodaxPortfolio', updated)

    const accId = await getSetting<number>('indodaxAccountId')
    if (accId) {
      await syncAccountBalance(accId, updated.totalIdr)
    }
  } catch {
    // Abaikan kegagalan jaringan sementara saat polling otomatis
  }
}

async function runBalancesOnly(
  set: (partial: Partial<IndodaxState>) => void,
) {

  if (!activeCreds) return
  try {
    const raw = await fetchRawBalances(activeCreds.apiKey, activeCreds.secret)
    currentRawBalances = raw
    await setSetting('indodaxRawBalances', raw)
    await runTickersOnly(set)
  } catch {
    // Abaikan
  }
}


export const useIndodaxLive = create<IndodaxState>((set, get) => ({
  connected: null,
  isLive: false,
  loading: false,
  portfolio: null,
  lastSync: null,
  error: null,

  init: async () => {
    if (isInitialized) return
    isInitialized = true

    try {
      const [cachedPortfolio, cachedSync, raw] = await Promise.all([
        getSetting<Portfolio>('indodaxPortfolio'),
        getSetting<number>('indodaxLastSync'),
        getSetting<RawBalances>('indodaxRawBalances'),
      ])

      if (cachedPortfolio) set({ portfolio: cachedPortfolio })
      if (cachedSync) set({ lastSync: cachedSync })
      if (raw) currentRawBalances = raw

      const creds = await loadCreds()
      if (creds) {
        activeCreds = creds
        set({ connected: true, isLive: true })

        // Mulai sinkronisasi awal
        get().refreshNow()
        startAllTimers(set)

        // Event listener hemat daya ketika tab background
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            stopAllTimers()
            set({ isLive: false })
          } else if (activeCreds) {
            startAllTimers(set)
            runTickersOnly(set)
          }
        })
      } else {
        set({ connected: false, isLive: false })
      }
    } catch (err) {
      set({
        error:
          err instanceof Error
            ? err.message
            : 'Gagal inisialisasi integrasi Indodax',
      })
    }
  },

  refreshNow: async () => {
    const creds = activeCreds || (await loadCreds())
    if (!creds) return

    activeCreds = creds
    set({ loading: true, error: null })
    try {
      const p = await fetchPortfolio(creds.apiKey, creds.secret)
      const now = Date.now()
      currentRawBalances =
        (await getSetting<RawBalances>('indodaxRawBalances')) ?? null

      set({
        connected: true,
        portfolio: p,
        lastSync: now,
        isLive: true,
      })

      await setSetting('indodaxPortfolio', p)
      await setSetting('indodaxLastSync', now)

      const accId = await getSetting<number>('indodaxAccountId')
      if (accId) {
        await syncAccountBalance(accId, p.totalIdr)
      }

      // Pastikan timers berjalan jika belum
      if (!tickerTimer) {
        startAllTimers(set)
      }
    } catch (err) {
      set({
        error:
          err instanceof Error
            ? err.message
            : 'Gagal sinkronisasi data Indodax.',
      })
    } finally {
      set({ loading: false })
    }
  },

  updateBuyPrice: async (code: string, price: number) => {
    await saveBuyPrice(code, price)
    const raw =
      currentRawBalances ||
      (await getSetting<RawBalances>('indodaxRawBalances'))
    const summaries = currentSummaries || (await fetchSummaries())
    const buyPrices = await loadBuyPrices()

    if (raw) {
      const updated = calculatePortfolio(raw, summaries, buyPrices)
      set({ portfolio: updated })
      await setSetting('indodaxPortfolio', updated)
    }
  },

  disconnect: async () => {
    stopAllTimers()
    activeCreds = null
    currentRawBalances = null
    currentSummaries = null
    await libClearCreds()
    set({
      connected: false,
      isLive: false,
      portfolio: null,
      lastSync: null,
      error: null,
    })
  },

  setConnectedManual: (c: boolean) => {
    set({ connected: c })
    if (c) {
      loadCreds().then((creds) => {
        if (creds) {
          activeCreds = creds
          startAllTimers(set)
          get().refreshNow()
        }
      })
    } else {
      stopAllTimers()
    }
  },

}))
