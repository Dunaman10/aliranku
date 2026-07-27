import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { db, type Budget, type Category } from '../db'
import type { BudgetStatus } from '../lib/budget'
import { formatIDR, formatNumber } from '../lib/money'
import { CatIcon } from './meta'
import { Card, Sheet } from './ui'

function barColor(ratio: number): string {
  if (ratio >= 1) return 'bg-rose-500'
  if (ratio >= 0.8) return 'bg-amber-500'
  return 'bg-teal-600'
}

/** Sheet pengaturan batas bulanan per kategori pengeluaran (PRD 6.7). */
function BudgetEditor({ onClose }: { onClose: () => void }) {
  const categories =
    useLiveQuery(
      () => db.categories.where('type').equals('expense').toArray(),
      [],
    ) ?? []
  const budgets = useLiveQuery(() => db.budgets.toArray(), [])
  const [values, setValues] = useState<Map<number, number> | null>(null)

  if (!budgets) return null
  const current =
    values ?? new Map(budgets.map((b) => [b.categoryId, b.amountPerMonth]))

  function setValue(catId: number, raw: string) {
    const digits = raw.replace(/\D/g, '')
    const next = new Map(current)
    next.set(catId, digits ? Math.min(Number(digits), 999_999_999_999) : 0)
    setValues(next)
  }

  async function save() {
    await db.transaction('rw', db.budgets, async () => {
      for (const c of categories) {
        const amount = current.get(c.id) ?? 0
        const existing = budgets!.find((b) => b.categoryId === c.id)
        if (amount > 0) {
          if (existing)
            await db.budgets.update(existing.id, { amountPerMonth: amount })
          else
            await db.budgets.add({
              categoryId: c.id,
              amountPerMonth: amount,
            } as Budget)
        } else if (existing) {
          await db.budgets.delete(existing.id)
        }
      }
    })
    onClose()
  }

  return (
    <Sheet title="Atur Budget Bulanan" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Isi batas pengeluaran per bulan. Kosongkan untuk menonaktifkan.
          Status budget ikut menentukan Skor Kesehatan Finansial.
        </p>
        {categories.map((c: Category) => (
          <div key={c.id} className="flex items-center gap-3">
            <CatIcon category={c} size={15} />
            <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
            <div className="flex items-center gap-1 rounded-xl bg-white px-3 py-2 dark:bg-stone-800">
              <span className="text-xs text-stone-400">Rp</span>
              <input
                inputMode="numeric"
                value={current.get(c.id) ? formatNumber(current.get(c.id)!) : ''}
                onChange={(e) => setValue(c.id, e.target.value)}
                placeholder="—"
                className="w-24 bg-transparent text-right text-sm tabular-nums outline-none"
              />
            </div>
          </div>
        ))}
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

/** Kartu progres budget bulan berjalan di Beranda. */
export default function BudgetSection({
  statuses,
}: {
  statuses: BudgetStatus[]
}) {
  const [editing, setEditing] = useState(false)
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
          Budget bulan ini
        </p>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400"
        >
          <Pencil size={12} /> Atur
        </button>
      </div>
      {statuses.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Belum ada budget. Setel batas per kategori biar pengeluaran
          terkendali, yuk!
        </p>
      ) : (
        <div className="space-y-2.5">
          {statuses.map((s) => (
            <div key={s.budget.id}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="font-medium">
                  {s.category?.name ?? 'Kategori'}
                  {s.ratio >= 1 && (
                    <span className="ml-1.5 text-rose-600 dark:text-rose-400">
                      jebol!
                    </span>
                  )}
                  {s.ratio >= 0.8 && s.ratio < 1 && (
                    <span className="ml-1.5 text-amber-600 dark:text-amber-400">
                      hampir habis
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-stone-500 dark:text-stone-400">
                  {formatIDR(s.spent)} / {formatIDR(s.budget.amountPerMonth)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                <div
                  className={`h-full rounded-full ${barColor(s.ratio)}`}
                  style={{ width: `${Math.min(s.ratio * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <BudgetEditor onClose={() => setEditing(false)} />}
    </Card>
  )
}
