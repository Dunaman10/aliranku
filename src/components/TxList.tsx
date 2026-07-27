import { ArrowLeftRight } from 'lucide-react'
import type { Account, Category, Tx } from '../db'
import { fmtDate, toDateStr } from '../lib/dates'
import { formatIDR } from '../lib/money'
import { useUI } from '../store'
import { CatIcon } from './meta'

export function TxRow({
  tx,
  categories,
  accounts,
}: {
  tx: Tx
  categories: Map<number, Category>
  accounts: Map<number, Account>
}) {
  const openEdit = useUI((s) => s.openEdit)
  const cat = tx.categoryId != null ? categories.get(tx.categoryId) : undefined
  const acc = accounts.get(tx.accountId)
  const toAcc = tx.toAccountId != null ? accounts.get(tx.toAccountId) : undefined

  const title =
    tx.type === 'transfer' ? 'Transfer' : (cat?.name ?? 'Tanpa kategori')
  const sub = [
    tx.type === 'transfer'
      ? `${acc?.name ?? '?'} → ${toAcc?.name ?? '?'}`
      : (acc?.name ?? ''),
    tx.note,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      onClick={() => openEdit(tx)}
      className="flex w-full items-center gap-3 py-2.5 text-left"
    >
      {tx.type === 'transfer' ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
          <ArrowLeftRight size={16} />
        </span>
      ) : (
        <CatIcon category={cat} size={16} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {title}
          {tx.isRecurring && (
            <span className="ml-1.5 rounded-full bg-teal-600/10 px-1.5 py-0.5 text-[10px] font-normal text-teal-700 dark:text-teal-400">
              otomatis
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
          {sub}
        </span>
      </span>
      <span
        className={`text-sm font-semibold tabular-nums ${
          tx.type === 'income'
            ? 'text-green-700 dark:text-green-500'
            : tx.type === 'expense'
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-stone-500 dark:text-stone-400'
        }`}
      >
        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
        {formatIDR(tx.amount)}
      </span>
    </button>
  )
}

/** Daftar transaksi dikelompokkan per tanggal (terbaru dulu). */
export function GroupedTxList({
  txs,
  categories,
  accounts,
}: {
  txs: Tx[]
  categories: Map<number, Category>
  accounts: Map<number, Account>
}) {
  const groups = new Map<string, Tx[]>()
  const sorted = [...txs].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  )
  for (const t of sorted) {
    const list = groups.get(t.date) ?? []
    list.push(t)
    groups.set(t.date, list)
  }
  const today = toDateStr(new Date())

  return (
    <div className="space-y-3">
      {[...groups.entries()].map(([date, list]) => (
        <div
          key={date}
          className="rounded-2xl bg-white px-4 py-1 shadow-sm dark:bg-stone-900"
        >
          <p className="border-b border-stone-100 pt-2 pb-1 text-xs font-medium text-stone-500 dark:border-stone-800 dark:text-stone-400">
            {date === today ? 'Hari ini' : fmtDate(date, 'EEEE, d MMM yyyy')}
          </p>
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {list.map((t) => (
              <TxRow
                key={t.id}
                tx={t}
                categories={categories}
                accounts={accounts}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
