import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { GroupedTxList } from '../components/TxList'
import { EmptyState } from '../components/ui'
import { db } from '../db'
import { getPeriod, inPeriod } from '../lib/dates'
import { formatIDR } from '../lib/money'

export default function Transactions() {
  const [offset, setOffset] = useState(0)
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const txs = useLiveQuery(() => db.transactions.toArray(), [])

  const data = useMemo(() => {
    if (!accounts || !categories || !txs) return null
    const period = getPeriod('monthly', offset)
    const list = txs.filter((t) => inPeriod(t.date, period))
    let masuk = 0
    let keluar = 0
    for (const t of list) {
      if (t.type === 'income') masuk += t.amount
      else if (t.type === 'expense') keluar += t.amount
    }
    return {
      period,
      list,
      masuk,
      keluar,
      catMap: new Map(categories.map((c) => [c.id, c])),
      accMap: new Map(accounts.map((a) => [a.id, a])),
    }
  }, [accounts, categories, txs, offset])

  if (!data) return null

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold">Transaksi</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((o) => o - 1)}
            aria-label="Bulan sebelumnya"
            className="rounded-full p-1.5 hover:bg-stone-200 dark:hover:bg-stone-800"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-28 text-center text-sm font-medium">
            {data.period.label}
          </span>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset === 0}
            aria-label="Bulan berikutnya"
            className="rounded-full p-1.5 hover:bg-stone-200 disabled:opacity-30 dark:hover:bg-stone-800"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="flex justify-between rounded-2xl bg-white px-4 py-2.5 text-sm shadow-sm dark:bg-stone-900">
        <span>
          Masuk{' '}
          <span className="font-semibold text-green-700 dark:text-green-500">
            {formatIDR(data.masuk)}
          </span>
        </span>
        <span>
          Keluar{' '}
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            {formatIDR(data.keluar)}
          </span>
        </span>
      </div>

      {data.list.length === 0 ? (
        <EmptyState text="Belum ada transaksi di bulan ini. Catat lewat tombol + di bawah, yuk!" />
      ) : (
        <GroupedTxList
          txs={data.list}
          categories={data.catMap}
          accounts={data.accMap}
        />
      )}
    </div>
  )
}
