import { differenceInCalendarDays } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import BudgetSection from '../components/BudgetSection'
import GoalsSection from '../components/GoalsSection'
import MiniBars from '../components/MiniBars'
import ScoreCard from '../components/ScoreCard'
import { TxRow } from '../components/TxList'
import { Card, EmptyState } from '../components/ui'
import { db } from '../db'
import { computeBalances, splitBalances } from '../lib/balances'
import { budgetStatuses } from '../lib/budget'
import { daysElapsedIn, fmtDate, getPeriod, inPeriod, lastNDays } from '../lib/dates'
import { formatIDR } from '../lib/money'
import { computeInsights, computeScore } from '../lib/score'
import { useUI } from '../store'

export default function Dashboard() {
  const { setTab, hideAmounts, toggleHideAmounts } = useUI()
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const txs = useLiveQuery(() => db.transactions.toArray(), [])
  const budgets = useLiveQuery(() => db.budgets.toArray(), [])
  const [showAccounts, setShowAccounts] = useState(false)

  const data = useMemo(() => {
    if (!accounts || !categories || !txs || !budgets) return null
    const catMap = new Map(categories.map((c) => [c.id, c]))
    const accMap = new Map(accounts.map((a) => [a.id, a]))
    const balances = computeBalances(accounts, txs)
    const { ready, invest } = splitBalances(accounts, balances)

    const month = getPeriod('monthly', 0)
    const prevMonth = getPeriod('monthly', -1)
    const monthTxs = txs.filter((t) => inPeriod(t.date, month))
    const prevTxs = txs.filter((t) => inPeriod(t.date, prevMonth))

    let masuk = 0
    let keluar = 0
    for (const t of monthTxs) {
      if (t.type === 'income') masuk += t.amount
      else if (t.type === 'expense') keluar += t.amount
    }

    // Skor bulan berjalan + syarat 7 hari data (PRD 7.4)
    const firstDate = txs.reduce<string | null>(
      (min, t) => (min == null || t.date < min ? t.date : min),
      null,
    )
    const dataDays =
      firstDate == null
        ? 0
        : differenceInCalendarDays(new Date(), new Date(`${firstDate}T00:00:00`)) + 1
    const budgetStats = budgetStatuses(budgets, monthTxs, catMap)
    const score = computeScore(monthTxs, catMap, daysElapsedIn(month), budgetStats)
    const insights = computeInsights(
      score,
      monthTxs,
      prevTxs,
      catMap,
      formatIDR,
      budgetStats,
    )
    const pending =
      txs.length > 0 && dataDays < 7
        ? `Skor akan muncul setelah 1 minggu pencatatan (hari ke-${dataDays} dari 7).`
        : undefined

    // Tren pengeluaran 7 hari terakhir
    const week = lastNDays(7).map((d) => ({
      label: fmtDate(d, 'EEEEEE'),
      keluar: txs
        .filter((t) => t.date === d && t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0),
    }))

    const recent = [...txs]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      .slice(0, 5)

    return {
      catMap,
      accMap,
      balances,
      ready,
      invest,
      masuk,
      keluar,
      score,
      insights,
      pending,
      week,
      recent,
      budgetStats,
      monthLabel: month.label,
    }
  }, [accounts, categories, txs, budgets])

  if (!data || !accounts) return null

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-teal-700 dark:text-teal-400">
            Aliranku
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {fmtDate(new Date(), 'EEEE, d MMMM yyyy')}
          </p>
        </div>
        <button
          onClick={toggleHideAmounts}
          aria-label={hideAmounts ? 'Tampilkan nominal' : 'Sembunyikan nominal'}
          className="flex size-9 items-center justify-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
        >
          {hideAmounts ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </header>

      {/* Saldo: uang siap pakai & investasi dipisah (PRD 6.3) */}
      <Card className="bg-gradient-to-br from-teal-600 to-teal-800 !text-white">
        <button
          className="w-full text-left"
          onClick={() => setShowAccounts((v) => !v)}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-teal-100">Uang Siap Pakai</p>
              <p className="text-2xl font-bold tabular-nums">
                {formatIDR(data.ready, hideAmounts)}
              </p>
            </div>
            {showAccounts ? (
              <ChevronDown size={18} className="mt-1 text-teal-200" />
            ) : (
              <ChevronRight size={18} className="mt-1 text-teal-200" />
            )}
          </div>
          <p className="mt-2 text-xs text-teal-100">
            Nilai Investasi{' '}
            <span className="font-semibold text-white">
              {formatIDR(data.invest, hideAmounts)}
            </span>
          </p>
        </button>
        {showAccounts && (
          <div className="mt-3 space-y-1 border-t border-teal-500/50 pt-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex justify-between text-sm">
                <span className="text-teal-100">{a.name}</span>
                <span className="font-medium tabular-nums">
                  {formatIDR(data.balances.get(a.id) ?? 0, hideAmounts)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Ringkasan bulan berjalan */}
      <Card>
        <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
          Duitmu bulan ini · {data.monthLabel}
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-stone-500 dark:text-stone-400">Masuk</p>
            <p className="text-sm font-bold text-green-700 dark:text-green-500">
              {formatIDR(data.masuk, hideAmounts)}
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-500 dark:text-stone-400">Keluar</p>
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400">
              {formatIDR(data.keluar, hideAmounts)}
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-500 dark:text-stone-400">Selisih</p>
            <p
              className={`text-sm font-bold ${
                data.masuk - data.keluar >= 0
                  ? 'text-green-700 dark:text-green-500'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatIDR(data.masuk - data.keluar, hideAmounts)}
            </p>
          </div>
        </div>
      </Card>

      <ScoreCard
        result={data.score}
        insights={data.insights}
        pending={data.pending}
      />

      <BudgetSection statuses={data.budgetStats} />

      <GoalsSection />

      <Card>
        <p className="mb-1 text-xs font-medium text-stone-500 dark:text-stone-400">
          Pengeluaran 7 hari terakhir
        </p>
        <MiniBars data={data.week} />
      </Card>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Transaksi terakhir</h2>
          <button
            onClick={() => setTab('txs')}
            className="text-xs font-medium text-teal-700 dark:text-teal-400"
          >
            Lihat semua
          </button>
        </div>
        {data.recent.length === 0 ? (
          <EmptyState text="Belum ada transaksi. Catat yang pertama, yuk!" />
        ) : (
          <Card className="!py-1">
            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {data.recent.map((t) => (
                <TxRow
                  key={t.id}
                  tx={t}
                  categories={data.catMap}
                  accounts={data.accMap}
                />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
