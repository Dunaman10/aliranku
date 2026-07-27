import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, PiggyBank, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { db, type Goal } from '../db'
import { fmtDate } from '../lib/dates'
import { formatIDR, formatNumber } from '../lib/money'
import { Card, Sheet } from './ui'

function MoneyField({
  value,
  onChange,
  placeholder = '0',
}: {
  value: number
  onChange: (v: number) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-white px-3 py-2.5 dark:bg-stone-800">
      <span className="text-xs text-stone-400">Rp</span>
      <input
        inputMode="numeric"
        value={value === 0 ? '' : formatNumber(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '')
          onChange(digits ? Math.min(Number(digits), 999_999_999_999) : 0)
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none"
      />
    </div>
  )
}

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal?.targetAmount ?? 0)
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [topUp, setTopUp] = useState(0)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) return setError('Nama target tidak boleh kosong.')
    if (target <= 0) return setError('Isi nominal targetnya, ya.')
    if (goal) {
      await db.goals.update(goal.id, {
        name: name.trim(),
        targetAmount: target,
        deadline: deadline || undefined,
        savedAmount: goal.savedAmount + topUp,
      })
    } else {
      await db.goals.add({
        name: name.trim(),
        targetAmount: target,
        savedAmount: topUp,
        deadline: deadline || undefined,
        createdAt: Date.now(),
      } as Goal)
    }
    onClose()
  }

  async function remove() {
    if (!goal) return
    if (!confirm(`Hapus target "${goal.name}"?`)) return
    await db.goals.delete(goal.id)
    onClose()
  }

  return (
    <Sheet
      title={goal ? 'Edit Target' : 'Target Menabung Baru'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama target (mis. Dana darurat)"
          className="w-full rounded-xl bg-white px-3 py-2.5 text-sm dark:bg-stone-800"
        />
        <div>
          <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
            Nominal target
          </p>
          <MoneyField value={target} onChange={setTarget} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
            Tenggat (opsional)
          </p>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="rounded-xl bg-white px-3 py-2 text-sm dark:bg-stone-800"
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
            {goal
              ? `Tambah dana (terkumpul ${formatIDR(goal.savedAmount)})`
              : 'Dana awal (opsional)'}
          </p>
          <MoneyField value={topUp} onChange={setTopUp} />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          {goal && (
            <button
              onClick={remove}
              aria-label="Hapus target"
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

/** Kartu target menabung di Beranda (PRD 6.11). */
export default function GoalsSection() {
  const goals = useLiveQuery(() => db.goals.toArray(), [])
  const [sheet, setSheet] = useState<
    { open: true; goal?: Goal } | { open: false }
  >({ open: false })

  if (!goals) return null

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
          Target menabung
        </p>
        <button
          onClick={() => setSheet({ open: true })}
          className="flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400"
        >
          <Plus size={13} /> Tambah
        </button>
      </div>
      {goals.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
          <PiggyBank size={16} /> Belum ada target. Mulai dari dana darurat,
          yuk!
        </p>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const ratio = Math.min(g.savedAmount / g.targetAmount, 1)
            return (
              <button
                key={g.id}
                onClick={() => setSheet({ open: true, goal: g })}
                className="block w-full text-left"
              >
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="font-medium">
                    {g.name}
                    {ratio >= 1 && ' 🎉'}
                  </span>
                  <span className="tabular-nums text-stone-500 dark:text-stone-400">
                    {formatIDR(g.savedAmount)} / {formatIDR(g.targetAmount)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
                {g.deadline && (
                  <p className="mt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
                    Tenggat {fmtDate(g.deadline)}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}
      {sheet.open && (
        <GoalForm goal={sheet.goal} onClose={() => setSheet({ open: false })} />
      )}
    </Card>
  )
}
