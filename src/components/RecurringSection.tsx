import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Plus, RefreshCw, SkipForward, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { db, type Recurring } from '../db'
import { fmtDate } from '../lib/dates'
import { formatIDR, formatNumber } from '../lib/money'
import { firstRun, skipOnce } from '../lib/recurring'
import { Card, Segmented, Sheet } from './ui'

function RecurringForm({
  item,
  onClose,
}: {
  item?: Recurring
  onClose: () => void
}) {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? []
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const [name, setName] = useState(item?.name ?? '')
  const [type, setType] = useState<'income' | 'expense'>(item?.type ?? 'expense')
  const [amount, setAmount] = useState(item?.amount ?? 0)
  const [categoryId, setCategoryId] = useState<number | undefined>(
    item?.categoryId,
  )
  const [accountId, setAccountId] = useState<number | undefined>(item?.accountId)
  const [day, setDay] = useState(item?.dayOfMonth ?? 1)
  const [error, setError] = useState('')

  const cats = categories.filter((c) => c.type === type)
  const effAccount = accountId ?? accounts[0]?.id

  async function save() {
    if (!name.trim()) return setError('Isi namanya dulu (mis. Gaji, Netflix).')
    if (amount <= 0) return setError('Isi nominalnya, ya.')
    if (categoryId == null || !cats.some((c) => c.id === categoryId))
      return setError('Pilih kategorinya.')
    if (effAccount == null) return setError('Buat akun dulu di bagian Akun.')
    const dayClamped = Math.min(Math.max(day, 1), 31)
    if (item) {
      await db.recurring.update(item.id, {
        name: name.trim(),
        type,
        amount,
        categoryId,
        accountId: effAccount,
        dayOfMonth: dayClamped,
        // Jadwal berubah → hitung ulang eksekusi berikutnya
        nextRun:
          dayClamped === item.dayOfMonth ? item.nextRun : firstRun(dayClamped),
      })
    } else {
      await db.recurring.add({
        name: name.trim(),
        type,
        amount,
        categoryId,
        accountId: effAccount,
        dayOfMonth: dayClamped,
        nextRun: firstRun(dayClamped),
        active: true,
      } as Recurring)
    }
    onClose()
  }

  return (
    <Sheet
      title={item ? 'Edit Transaksi Rutin' : 'Transaksi Rutin Baru'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama (mis. Gaji, Netflix, Kos)"
          className="w-full rounded-xl bg-white px-3 py-2.5 text-sm dark:bg-stone-800"
        />
        <Segmented
          value={type}
          onChange={(t) => {
            setType(t)
            setCategoryId(undefined)
          }}
          options={[
            { value: 'expense', label: 'Pengeluaran' },
            { value: 'income', label: 'Pemasukan' },
          ]}
        />
        <div className="flex items-center gap-1 rounded-xl bg-white px-3 py-2.5 dark:bg-stone-800">
          <span className="text-xs text-stone-400">Rp</span>
          <input
            inputMode="numeric"
            value={amount === 0 ? '' : formatNumber(amount)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              setAmount(digits ? Math.min(Number(digits), 999_999_999_999) : 0)
            }}
            placeholder="Nominal"
            className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={categoryId ?? ''}
            onChange={(e) =>
              setCategoryId(e.target.value ? Number(e.target.value) : undefined)
            }
            className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2.5 text-sm dark:bg-stone-800"
          >
            <option value="">Kategori…</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={effAccount ?? ''}
            onChange={(e) => setAccountId(Number(e.target.value))}
            className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2.5 text-sm dark:bg-stone-800"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Tiap tanggal
          <input
            type="number"
            min={1}
            max={31}
            value={day}
            onChange={(e) => setDay(Number(e.target.value) || 1)}
            className="w-16 rounded-xl bg-white px-3 py-2 text-center text-sm dark:bg-stone-800"
          />
          <span className="text-xs text-stone-500 dark:text-stone-400">
            (bulan pendek otomatis ke tanggal terakhir)
          </span>
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          onClick={save}
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white active:bg-teal-700"
        >
          Simpan
        </button>
      </div>
    </Sheet>
  )
}

/** Kelola transaksi berulang (PRD 6.8) — dipakai di halaman Pengaturan. */
export default function RecurringSection() {
  const items = useLiveQuery(() => db.recurring.toArray(), [])
  const [sheet, setSheet] = useState<
    { open: true; item?: Recurring } | { open: false }
  >({ open: false })

  if (!items) return null

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <RefreshCw size={14} /> Transaksi Rutin
        </h2>
        <button
          onClick={() => setSheet({ open: true })}
          className="flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400"
        >
          <Plus size={14} /> Tambah
        </button>
      </div>
      <Card className="!p-2">
        {items.length === 0 ? (
          <p className="px-2 py-2 text-sm text-stone-500 dark:text-stone-400">
            Jadwalkan gaji, langganan, atau kos — tercatat otomatis pada
            tanggalnya.
          </p>
        ) : (
          items.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {r.name}
                  {!r.active && (
                    <span className="ml-1.5 text-[11px] text-stone-400">
                      (nonaktif)
                    </span>
                  )}
                </span>
                <span className="block text-xs text-stone-500 dark:text-stone-400">
                  {r.type === 'income' ? '+' : '−'}
                  {formatIDR(r.amount)} · tiap tgl {r.dayOfMonth} · berikutnya{' '}
                  {fmtDate(r.nextRun, 'd MMM')}
                </span>
              </span>
              <button
                onClick={() => skipOnce(r)}
                title="Lewati sekali"
                aria-label={`Lewati ${r.name} sekali`}
                className="p-1.5 text-stone-400 hover:text-amber-600"
              >
                <SkipForward size={15} />
              </button>
              <input
                type="checkbox"
                checked={r.active}
                onChange={(e) =>
                  db.recurring.update(r.id, { active: e.target.checked })
                }
                aria-label={`Aktifkan ${r.name}`}
                className="size-4 accent-teal-600"
              />
              <button
                onClick={() => setSheet({ open: true, item: r })}
                aria-label={`Edit ${r.name}`}
                className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={async () => {
                  if (confirm(`Hapus transaksi rutin "${r.name}"?`))
                    await db.recurring.delete(r.id)
                }}
                aria-label={`Hapus ${r.name}`}
                className="p-1.5 text-stone-400 hover:text-rose-600"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </Card>
      {sheet.open && (
        <RecurringForm
          item={sheet.item}
          onClose={() => setSheet({ open: false })}
        />
      )}
    </section>
  )
}
