import { BarChart3, Home, List, Plus, Settings as SettingsIcon } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import AddSheet from './components/AddSheet'
import LockScreen from './components/LockScreen'
import { getSetting } from './db'
import { checkReminder } from './lib/notify'
import { processRecurring } from './lib/recurring'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Transactions from './pages/Transactions'
import { useUI, type Tab } from './store'

// Laporan memuat Recharts — dipisah agar bundle awal tetap ringan
const Reports = lazy(() => import('./pages/Reports'))

const TABS: Array<{ tab: Tab; label: string; icon: typeof Home }> = [
  { tab: 'home', label: 'Beranda', icon: Home },
  { tab: 'txs', label: 'Transaksi', icon: List },
  { tab: 'reports', label: 'Laporan', icon: BarChart3 },
  { tab: 'settings', label: 'Pengaturan', icon: SettingsIcon },
]

function BottomNav() {
  const { tab, setTab, openAdd } = useUI()
  const items = [TABS[0], TABS[1], null, TABS[2], TABS[3]]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-stone-800 dark:bg-stone-900">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item, i) =>
          item === null ? (
            <div key={i} className="relative flex justify-center">
              <button
                onClick={openAdd}
                aria-label="Tambah transaksi"
                className="absolute -top-6 flex size-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg active:bg-teal-700"
              >
                <Plus size={26} />
              </button>
            </div>
          ) : (
            <button
              key={item.tab}
              onClick={() => setTab(item.tab)}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                tab === item.tab
                  ? 'font-semibold text-teal-700 dark:text-teal-400'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ),
        )}
      </div>
    </nav>
  )
}

export default function App() {
  const { tab, sheet, toast } = useUI()
  // null = masih memuat status PIN; string = terkunci dengan hash tsb
  const [lockHash, setLockHash] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    getSetting<string>('pinHash').then((h) => setLockHash(h ?? null))
    // Minta penyimpanan persisten agar IndexedDB tidak dihapus otomatis
    // saat memori perangkat menipis (kunci arsitektur local-first)
    navigator.storage?.persist?.().catch(() => {})
    // Catat transaksi rutin yang jatuh tempo (PRD 6.8)
    processRecurring()
    // Reminder harian — dicek saat buka & tiap 30 detik selama aplikasi hidup
    checkReminder()
    const timer = setInterval(checkReminder, 30_000)
    return () => clearInterval(timer)
  }, [])

  if (lockHash === undefined) return null
  if (lockHash) {
    return <LockScreen pinHash={lockHash} onUnlock={() => setLockHash(null)} />
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24">
      {tab === 'home' && <Dashboard />}
      {tab === 'txs' && <Transactions />}
      {tab === 'reports' && (
        <Suspense fallback={null}>
          <Reports />
        </Suspense>
      )}
      {tab === 'settings' && <Settings />}
      <BottomNav />
      {sheet.open && <AddSheet key={sheet.editTx?.id ?? 'new'} />}
      {toast && (
        <div className="fixed inset-x-0 top-3 z-[70] flex justify-center px-4">
          <div className="max-w-md rounded-xl bg-stone-800 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-stone-700">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
