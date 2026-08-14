import { addDays, format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, FileDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ExpenseDonut, IncomeExpenseBars, ScoreLine } from '../components/charts'
import { catColor } from '../components/meta'
import { Card, EmptyState, Segmented } from '../components/ui'
import { db, type Tx } from '../db'
import {
  daysElapsedIn,
  getPeriod,
  inPeriod,
  toDateStr,
  type Period,
  type PeriodKind,
} from '../lib/dates'
import { formatIDR } from '../lib/money'
import { exportReportPDF } from '../lib/pdf'
import { computeScore } from '../lib/score'

interface Bucket {
  label: string
  start: string
  end: string
}

function buckets(period: Period): Bucket[] {
  if (period.kind === 'weekly') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(period.start, i)
      const s = toDateStr(d)
      return { label: format(d, 'EEE', { locale: localeId }), start: s, end: s }
    })
  }
  if (period.kind === 'monthly') {
    const lastDay = period.end.getDate()
    const ranges = [
      [1, 7],
      [8, 14],
      [15, 21],
      [22, 28],
      [29, lastDay],
    ].filter(([a]) => a <= lastDay)
    return ranges.map(([a, b]) => {
      const bb = Math.min(b, lastDay)
      const ym = format(period.start, 'yyyy-MM')
      return {
        label: `${a}–${bb}`,
        start: `${ym}-${String(a).padStart(2, '0')}`,
        end: `${ym}-${String(bb).padStart(2, '0')}`,
      }
    })
  }
  const y = period.start.getFullYear()
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return {
      label: format(new Date(y, i, 1), 'MMM', { locale: localeId }),
      start: `${y}-${m}-01`,
      end: `${y}-${m}-31`,
    }
  })
}

function pctChange(cur: number, prev: number): string | null {
  if (prev <= 0) return null
  const p = Math.round(((cur - prev) / prev) * 100)
  return `${p > 0 ? '↑' : p < 0 ? '↓' : '='}${Math.abs(p)}%`
}

const KIND_LABEL: Record<PeriodKind, string> = {
  weekly: 'minggu lalu',
  monthly: 'bulan lalu',
  yearly: 'tahun lalu',
}

export default function Reports() {
  const [kind, setKind] = useState<PeriodKind>('monthly')
  const [offset, setOffset] = useState(0)
  const [accountFilter, setAccountFilter] = useState<number | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all')

  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const txs = useLiveQuery(() => db.transactions.toArray(), [])

  const data = useMemo(() => {
    if (!accounts || !categories || !txs) return null
    const catMap = new Map(categories.map((c) => [c.id, c]))
    const period = getPeriod(kind, offset)
    const prevPeriod = getPeriod(kind, offset - 1)

    const matchFilter = (t: Tx) =>
      (accountFilter === 'all' ||
        t.accountId === accountFilter ||
        t.toAccountId === accountFilter) &&
      (categoryFilter === 'all' || t.categoryId === categoryFilter)

    const inCur = txs.filter((t) => inPeriod(t.date, period) && matchFilter(t))
    const inPrev = txs.filter(
      (t) => inPeriod(t.date, prevPeriod) && matchFilter(t),
    )

    const sum = (list: Tx[], type: 'income' | 'expense') =>
      list.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0)

    const masuk = sum(inCur, 'income')
    const keluar = sum(inCur, 'expense')
    const prevMasuk = sum(inPrev, 'income')
    const prevKeluar = sum(inPrev, 'expense')

    // Grafik batang per sub-periode
    const bars = buckets(period).map((b) => {
      const list = inCur.filter((t) => t.date >= b.start && t.date <= b.end)
      return {
        label: b.label,
        masuk: sum(list, 'income'),
        keluar: sum(list, 'expense'),
      }
    })

    // Komposisi pengeluaran per kategori → donat + top 5
    const byCat = new Map<number | -1, number>()
    for (const t of inCur) {
      if (t.type !== 'expense') continue
      const key = t.categoryId ?? -1
      byCat.set(key, (byCat.get(key) ?? 0) + t.amount)
    }
    const catRows = [...byCat.entries()]
      .map(([catId, value]) => {
        const c = catId !== -1 ? catMap.get(catId) : undefined
        return {
          name: c?.name ?? 'Tanpa kategori',
          color: catColor(c?.color ?? 'gray'),
          value,
        }
      })
      .sort((a, b) => b.value - a.value)
    const top5 = catRows.slice(0, 5)
    const rest = catRows.slice(5).reduce((s, r) => s + r.value, 0)
    const donut =
      rest > 0
        ? [...top5, { name: 'Lainnya', color: catColor('gray'), value: rest }]
        : top5

    // Riwayat skor 6 periode terakhir (tanpa filter — skor menyangkut keseluruhan)
    const history = Array.from({ length: 6 }, (_, i) => {
      const off = offset - 5 + i
      const p = getPeriod(kind, off)
      const list = txs.filter((t) => inPeriod(t.date, p))
      const r = computeScore(list, catMap, daysElapsedIn(p))
      const label =
        kind === 'monthly'
          ? format(p.start, 'MMM', { locale: localeId })
          : kind === 'yearly'
            ? format(p.start, 'yyyy')
            : format(p.start, 'd/M')
      return { label, skor: r.status === 'ok' ? r.score : null }
    })

    return {
      period,
      masuk,
      keluar,
      dMasuk: pctChange(masuk, prevMasuk),
      dKeluar: pctChange(keluar, prevKeluar),
      bars,
      donut,
      top5,
      totalKeluar: keluar,
      history,
      hasData: inCur.length > 0,
      inCur,
    }
  }, [accounts, categories, txs, kind, offset, accountFilter, categoryFilter])

  if (!data || !accounts || !categories) return null
  const selisih = data.masuk - data.keluar

  function handleExportPDF() {
    if (!data || !accounts || !categories) return

    const accName =
      accountFilter === 'all'
        ? 'Semua akun'
        : accounts.find((a) => a.id === accountFilter)?.name
    const catName =
      categoryFilter === 'all'
        ? 'Semua kategori'
        : categories.find((c) => c.id === categoryFilter)?.name

    exportReportPDF({
      period: data.period,
      transactions: data.inCur,
      accounts,
      categories,
      income: data.masuk,
      expense: data.keluar,
      accountFilterName: accName,
      categoryFilterName: catName,
    })
  }

  return (
    <div className="space-y-4 p-4">
      <header className="pt-2">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Laporan</h1>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700 active:scale-95"
            title="Download Laporan PDF"
          >
            <FileDown size={15} />
            <span>Export PDF</span>
          </button>
        </div>
        <Segmented
          value={kind}
          onChange={(k) => {
            setKind(k)
            setOffset(0)
          }}
          options={[
            { value: 'weekly', label: 'Mingguan' },
            { value: 'monthly', label: 'Bulanan' },
            { value: 'yearly', label: 'Tahunan' },
          ]}
        />
      </header>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setOffset((o) => o - 1)}
          aria-label="Periode sebelumnya"
          className="rounded-full p-1.5 hover:bg-stone-200 dark:hover:bg-stone-800"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold">{data.period.label}</span>
        <button
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset === 0}
          aria-label="Periode berikutnya"
          className="rounded-full p-1.5 hover:bg-stone-200 disabled:opacity-30 dark:hover:bg-stone-800"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Filter per akun & kategori (PRD 6.5) */}
      <div className="flex gap-2">
        <select
          value={accountFilter}
          onChange={(e) =>
            setAccountFilter(
              e.target.value === 'all' ? 'all' : Number(e.target.value),
            )
          }
          className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm dark:bg-stone-900"
        >
          <option value="all">Semua akun</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter(
              e.target.value === 'all' ? 'all' : Number(e.target.value),
            )
          }
          className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm dark:bg-stone-900"
        >
          <option value="all">Semua kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-stone-500 dark:text-stone-400">Masuk</p>
            <p className="text-sm font-bold text-green-700 dark:text-green-500">
              {formatIDR(data.masuk)}
            </p>
            {data.dMasuk && (
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {data.dMasuk} vs {KIND_LABEL[kind]}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-stone-500 dark:text-stone-400">Keluar</p>
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400">
              {formatIDR(data.keluar)}
            </p>
            {data.dKeluar && (
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {data.dKeluar} vs {KIND_LABEL[kind]}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {selisih >= 0 ? 'Surplus' : 'Defisit'}
            </p>
            <p
              className={`text-sm font-bold ${
                selisih >= 0
                  ? 'text-green-700 dark:text-green-500'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatIDR(Math.abs(selisih))}
            </p>
          </div>
        </div>
      </Card>

      {!data.hasData ? (
        <EmptyState text="Belum ada transaksi di periode ini." />
      ) : (
        <>
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
                Masuk vs Keluar
              </p>
              <div className="flex gap-3 text-[11px] text-stone-500 dark:text-stone-400">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-[var(--chart-income)]" />
                  Masuk
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-[var(--chart-expense)]" />
                  Keluar
                </span>
              </div>
            </div>
            <IncomeExpenseBars data={data.bars} />
          </Card>

          {data.donut.length > 0 && (
            <Card>
              <p className="mb-1 text-xs font-medium text-stone-500 dark:text-stone-400">
                Komposisi pengeluaran
              </p>
              <ExpenseDonut data={data.donut} total={data.totalKeluar} />
              <div className="mt-2 space-y-1.5">
                {data.top5.map((r) => (
                  <div key={r.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="font-medium tabular-nums">
                      {formatIDR(r.value)}
                    </span>
                    <span className="w-10 text-right text-xs text-stone-500 dark:text-stone-400">
                      {data.totalKeluar > 0
                        ? Math.round((r.value / data.totalKeluar) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Card>
        <p className="mb-1 text-xs font-medium text-stone-500 dark:text-stone-400">
          Riwayat Skor Kesehatan Finansial
        </p>
        <ScoreLine data={data.history} />
      </Card>
    </div>
  )
}
