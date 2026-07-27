import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Delete, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { db, type Tx, type TxType } from '../db'
import { toDateStr } from '../lib/dates'
import { formatIDR } from '../lib/money'
import { useUI } from '../store'
import { ACCOUNT_TYPES, CatIcon } from './meta'
import { Segmented, Sheet } from './ui'

const LAST_ACCOUNT_KEY = 'aliranku-last-account'
const MAX_AMOUNT = 999_999_999_999

function Numpad({ onDigit, onTriple, onBackspace }: {
  onDigit: (d: number) => void
  onTriple: () => void
  onBackspace: () => void
}) {
  const btn =
    'rounded-xl bg-white py-3 text-xl font-semibold shadow-sm active:bg-stone-200 dark:bg-stone-800 dark:active:bg-stone-700'
  return (
    <div className="grid grid-cols-3 gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
        <button key={d} className={btn} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <button className={btn} onClick={onTriple}>
        000
      </button>
      <button className={btn} onClick={() => onDigit(0)}>
        0
      </button>
      <button
        className={`${btn} flex items-center justify-center text-stone-500`}
        onClick={onBackspace}
        aria-label="Hapus angka"
      >
        <Delete size={22} />
      </button>
    </div>
  )
}

/** Peringatan saat pengeluaran mendekati/melewati budget kategori (US5). */
async function budgetWarning(
  categoryId: number,
  date: string,
): Promise<string | null> {
  const budget = await db.budgets.where('categoryId').equals(categoryId).first()
  if (!budget || budget.amountPerMonth <= 0) return null
  const month = date.slice(0, 7)
  const spent = (
    await db.transactions.where('categoryId').equals(categoryId).toArray()
  )
    .filter((t) => t.type === 'expense' && t.date.startsWith(month))
    .reduce((s, t) => s + t.amount, 0)
  const cat = await db.categories.get(categoryId)
  const name = cat?.name ?? 'kategori'
  if (spent > budget.amountPerMonth)
    return `⚠️ Budget ${name} terlampaui ${formatIDR(spent - budget.amountPerMonth)}!`
  const ratio = spent / budget.amountPerMonth
  if (ratio >= 0.8)
    return `Budget ${name} sudah ${Math.round(ratio * 100)}% terpakai.`
  return null
}

export default function AddSheet() {
  const { sheet, closeSheet, showToast } = useUI()
  const editTx = sheet.editTx

  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? []
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []

  const [type, setType] = useState<TxType>(editTx?.type ?? 'expense')
  const [amount, setAmount] = useState(editTx?.amount ?? 0)
  const [categoryId, setCategoryId] = useState<number | undefined>(
    editTx?.categoryId,
  )
  const [accountId, setAccountId] = useState<number | undefined>(
    editTx?.accountId ??
      (Number(localStorage.getItem(LAST_ACCOUNT_KEY)) || undefined),
  )
  const [toAccountId, setToAccountId] = useState<number | undefined>(
    editTx?.toAccountId,
  )
  const [date, setDate] = useState(editTx?.date ?? toDateStr(new Date()))
  const [note, setNote] = useState(editTx?.note ?? '')
  const [error, setError] = useState('')

  const cats = categories.filter((c) =>
    type === 'income' ? c.type === 'income' : c.type === 'expense',
  )
  const effAccountId =
    accountId != null && accounts.some((a) => a.id === accountId)
      ? accountId
      : accounts[0]?.id

  async function save() {
    if (amount <= 0) return setError('Isi nominalnya dulu, ya.')
    if (effAccountId == null) return setError('Buat akun dulu di Pengaturan.')
    if (type !== 'transfer' && categoryId == null)
      return setError('Pilih kategorinya dulu, ya.')
    if (type === 'transfer') {
      if (toAccountId == null) return setError('Pilih akun tujuan transfer.')
      if (toAccountId === effAccountId)
        return setError('Akun asal dan tujuan tidak boleh sama.')
    }
    const now = Date.now()
    const data = {
      type,
      amount,
      categoryId: type === 'transfer' ? undefined : categoryId,
      accountId: effAccountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      date,
      note: note.trim() || undefined,
      updatedAt: now,
    }
    if (editTx) {
      await db.transactions.update(editTx.id, data)
    } else {
      await db.transactions.add({ ...data, createdAt: now } as Tx)
    }
    localStorage.setItem(LAST_ACCOUNT_KEY, String(effAccountId))
    closeSheet()
    if (type === 'expense' && categoryId != null) {
      const warning = await budgetWarning(categoryId, date)
      if (warning) showToast(warning)
    }
  }

  async function remove() {
    if (!editTx) return
    if (!confirm('Hapus transaksi ini?')) return
    await db.transactions.delete(editTx.id)
    closeSheet()
  }

  const accountChip = (
    id: number | undefined,
    setId: (v: number) => void,
    exclude?: number,
  ) => (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {accounts
        .filter((a) => a.id !== exclude)
        .map((a) => {
          const Icon = ACCOUNT_TYPES[a.type].icon
          return (
            <button
              key={a.id}
              onClick={() => setId(a.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                id === a.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
              }`}
            >
              <Icon size={14} />
              {a.name}
            </button>
          )
        })}
    </div>
  )

  return (
    <Sheet
      title={editTx ? 'Edit Transaksi' : 'Tambah Transaksi'}
      onClose={closeSheet}
    >
      <div className="space-y-4">
        <Segmented
          value={type}
          onChange={(t) => {
            setType(t)
            setCategoryId(undefined)
            setError('')
          }}
          options={[
            {
              value: 'expense',
              label: 'Keluar',
              activeClass: 'bg-rose-600 text-white shadow-sm',
            },
            {
              value: 'income',
              label: 'Masuk',
              activeClass: 'bg-green-700 text-white shadow-sm',
            },
            {
              value: 'transfer',
              label: 'Transfer',
              activeClass: 'bg-teal-600 text-white shadow-sm',
            },
          ]}
        />

        <div className="py-1 text-center">
          <div
            className={`text-4xl font-bold tabular-nums ${
              amount === 0 ? 'text-stone-300 dark:text-stone-600' : ''
            }`}
          >
            {formatIDR(amount)}
          </div>
        </div>

        {type !== 'transfer' ? (
          <div>
            <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
              Kategori
            </p>
            <div className="grid grid-cols-4 gap-2">
              {cats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl p-2 ${
                    categoryId === c.id
                      ? 'bg-teal-600/15 ring-2 ring-teal-600'
                      : 'bg-white dark:bg-stone-800'
                  }`}
                >
                  <CatIcon category={c} size={16} />
                  <span className="line-clamp-1 text-[10px] leading-tight">
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
            {type === 'transfer' ? 'Dari akun' : 'Akun'}
          </p>
          {accountChip(effAccountId, setAccountId)}
        </div>

        {type === 'transfer' && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400">
              <ArrowRight size={12} /> Ke akun
            </p>
            {accountChip(toAccountId, setToAccountId, effAccountId)}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            max={toDateStr(new Date())}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-xl bg-white px-3 py-2 text-sm dark:bg-stone-800"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan (opsional)"
            className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm dark:bg-stone-800"
          />
        </div>

        <Numpad
          onDigit={(d) => setAmount((a) => Math.min(a * 10 + d, MAX_AMOUNT))}
          onTriple={() => setAmount((a) => Math.min(a * 1000, MAX_AMOUNT))}
          onBackspace={() => setAmount((a) => Math.floor(a / 10))}
        />

        {error && (
          <p className="text-center text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          {editTx && (
            <button
              onClick={remove}
              aria-label="Hapus transaksi"
              className="rounded-xl bg-rose-100 p-3 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
            >
              <Trash2 size={20} />
            </button>
          )}
          <button
            onClick={save}
            className="flex-1 rounded-xl bg-teal-600 py-3 font-semibold text-white active:bg-teal-700"
          >
            Simpan
          </button>
        </div>
      </div>
    </Sheet>
  )
}
