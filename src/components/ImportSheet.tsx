import { useLiveQuery } from 'dexie-react-hooks'
import { FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { db, type Tx } from '../db'
import {
  buildRows,
  extractKeyword,
  guessColumns,
  parseCSV,
  type AmountMode,
  type ColumnGuess,
  type ImportRow,
  type ParsedCSV,
} from '../lib/importCsv'
import { fmtDate } from '../lib/dates'
import { formatIDR } from '../lib/money'
import { useUI } from '../store'
import { Sheet } from './ui'

type Step =
  | { step: 'file' }
  | { step: 'map'; parsed: ParsedCSV; cols: ColumnGuess; mode: AmountMode }
  | { step: 'review'; rows: ImportRow[]; skipped: number }

/** Wizard impor e-statement bank CSV (PRD 6.13). */
export default function ImportSheet({ onClose }: { onClose: () => void }) {
  const { showToast } = useUI()
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? []
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const [state, setState] = useState<Step>({ step: 'file' })
  const [accountId, setAccountId] = useState<number | undefined>()
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const effAccount = accountId ?? accounts.find((a) => a.type !== 'investasi')?.id
  const selectCls =
    'min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm dark:bg-stone-800'

  async function onFile(file: File) {
    try {
      const parsed = parseCSV(await file.text())
      if (parsed.rows.length === 0) {
        setError('File kosong atau format tidak dikenali.')
        return
      }
      const cols = guessColumns(parsed.headers)
      const mode: AmountMode =
        cols.debit >= 0 && cols.credit >= 0
          ? 'two-col'
          : cols.dcFlag >= 0
            ? 'flag'
            : 'signed'
      setError('')
      setState({ step: 'map', parsed, cols, mode })
    } catch {
      setError('Gagal membaca file CSV.')
    }
  }

  async function toReview() {
    if (state.step !== 'map') return
    const { rows, skipped } = buildRows(
      state.parsed,
      state.cols,
      state.mode,
      categories,
      await db.transactions.toArray(),
    )
    if (rows.length === 0) {
      setError(
        'Tidak ada baris yang bisa dibaca — cek lagi pemetaan kolom tanggal & nominalnya.',
      )
      return
    }
    setError('')
    setState({ step: 'review', rows, skipped })
  }

  async function doImport() {
    if (state.step !== 'review' || effAccount == null) return
    const chosen = state.rows.filter((r) => r.include && r.categoryId != null)
    if (chosen.length === 0) {
      setError('Tidak ada baris terpilih (pastikan kategorinya terisi).')
      return
    }
    const now = Date.now()
    await db.transactions.bulkAdd(
      chosen.map(
        (r) =>
          ({
            type: r.kind,
            amount: r.amount,
            categoryId: r.categoryId,
            accountId: effAccount,
            date: r.date,
            note: r.desc || undefined,
            createdAt: now,
            updatedAt: now,
          }) as Tx,
      ),
    )
    // Belajar dari koreksi: simpan kata kunci deskripsi ke kategori pilihan
    for (const r of chosen) {
      if (r.categoryId === r.guessedId) continue
      const kw = extractKeyword(r.desc)
      if (!kw) continue
      const cat = categories.find((c) => c.id === r.categoryId)
      if (!cat || cat.keywords?.includes(kw)) continue
      await db.categories.update(r.categoryId!, {
        keywords: [...(cat.keywords ?? []), kw].slice(-50),
      })
    }
    showToast(`${chosen.length} transaksi berhasil diimpor. 🎉`)
    onClose()
  }

  return (
    <Sheet title="Impor e-Statement (CSV)" onClose={onClose}>
      {state.step === 'file' && (
        <div className="space-y-4">
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Unduh laporan mutasi (CSV) dari aplikasi bankmu, lalu unggah di
            sini. Kamu akan me-review semuanya dulu sebelum tercatat — duplikat
            terdeteksi otomatis.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-teal-600/50 p-8 text-teal-700 dark:text-teal-400"
          >
            <FileUp size={28} />
            <span className="text-sm font-semibold">Pilih file CSV</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
              e.target.value = ''
            }}
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      )}

      {state.step === 'map' && (
        <div className="space-y-4">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Cocokkan kolom dari file ({state.parsed.rows.length} baris
            terdeteksi). Biasanya sudah terdeteksi otomatis.
          </p>
          {(
            [
              ['Kolom tanggal', 'date'],
              ['Kolom deskripsi', 'desc'],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0">{label}</span>
              <select
                value={state.cols[key]}
                onChange={(e) =>
                  setState({
                    ...state,
                    cols: { ...state.cols, [key]: Number(e.target.value) },
                  })
                }
                className={selectCls}
              >
                <option value={-1}>—</option>
                {state.parsed.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Kolom ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0">Bentuk nominal</span>
            <select
              value={state.mode}
              onChange={(e) =>
                setState({ ...state, mode: e.target.value as AmountMode })
              }
              className={selectCls}
            >
              <option value="signed">Satu kolom (+/−)</option>
              <option value="flag">Satu kolom + penanda D/K</option>
              <option value="two-col">Dua kolom debit & kredit</option>
            </select>
          </label>
          {state.mode !== 'two-col' ? (
            <label className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0">Kolom nominal</span>
              <select
                value={state.cols.amount}
                onChange={(e) =>
                  setState({
                    ...state,
                    cols: { ...state.cols, amount: Number(e.target.value) },
                  })
                }
                className={selectCls}
              >
                <option value={-1}>—</option>
                {state.parsed.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Kolom ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            (
              [
                ['Kolom debit', 'debit'],
                ['Kolom kredit', 'credit'],
              ] as const
            ).map(([label, key]) => (
              <label key={key} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0">{label}</span>
                <select
                  value={state.cols[key]}
                  onChange={(e) =>
                    setState({
                      ...state,
                      cols: { ...state.cols, [key]: Number(e.target.value) },
                    })
                  }
                  className={selectCls}
                >
                  <option value={-1}>—</option>
                  {state.parsed.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Kolom ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))
          )}
          {state.mode === 'flag' && (
            <label className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0">Kolom D/K</span>
              <select
                value={state.cols.dcFlag}
                onChange={(e) =>
                  setState({
                    ...state,
                    cols: { ...state.cols, dcFlag: Number(e.target.value) },
                  })
                }
                className={selectCls}
              >
                <option value={-1}>—</option>
                {state.parsed.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Kolom ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0">Masuk ke akun</span>
            <select
              value={effAccount ?? ''}
              onChange={(e) => setAccountId(Number(e.target.value))}
              className={selectCls}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            onClick={toReview}
            className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white active:bg-teal-700"
          >
            Lanjut ke review
          </button>
        </div>
      )}

      {state.step === 'review' && (
        <ReviewList
          rows={state.rows}
          skipped={state.skipped}
          categories={categories}
          error={error}
          onChange={(rows) => setState({ ...state, rows })}
          onImport={doImport}
        />
      )}
    </Sheet>
  )
}

function ReviewList({
  rows,
  skipped,
  categories,
  error,
  onChange,
  onImport,
}: {
  rows: ImportRow[]
  skipped: number
  categories: Array<{ id: number; name: string; type: string }>
  error: string
  onChange: (rows: ImportRow[]) => void
  onImport: () => void
}) {
  const chosen = rows.filter((r) => r.include)
  const dups = rows.filter((r) => r.exactDup).length
  const update = (i: number, patch: Partial<ImportRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {chosen.length} dari {rows.length} baris dipilih
        {dups > 0 && ` · ${dups} duplikat dilewati`}
        {skipped > 0 && ` · ${skipped} baris tak terbaca`}
      </p>
      <div className="max-h-[46dvh] space-y-2 overflow-y-auto pr-1">
        {rows.map((r, i) => (
          <div
            key={i}
            className={`rounded-xl bg-white p-2.5 dark:bg-stone-800 ${
              r.include ? '' : 'opacity-45'
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={r.include}
                onChange={(e) => update(i, { include: e.target.checked })}
                className="size-4 shrink-0 accent-teal-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {r.desc || '(tanpa deskripsi)'}
                </span>
                <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                  {fmtDate(r.date, 'd MMM yyyy')}
                  {r.exactDup && (
                    <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
                      duplikat
                    </span>
                  )}
                  {r.softDup && (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                      mirip yang sudah ada
                    </span>
                  )}
                </span>
              </span>
              <span
                className={`shrink-0 text-xs font-semibold tabular-nums ${
                  r.kind === 'income'
                    ? 'text-green-700 dark:text-green-500'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {r.kind === 'income' ? '+' : '−'}
                {formatIDR(r.amount)}
              </span>
            </div>
            {r.include && (
              <select
                value={r.categoryId ?? ''}
                onChange={(e) =>
                  update(i, {
                    categoryId: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
                className="mt-1.5 w-full rounded-lg bg-stone-100 px-2 py-1.5 text-xs dark:bg-stone-700"
              >
                <option value="">Pilih kategori…</option>
                {categories
                  .filter((c) => c.type === r.kind)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        onClick={onImport}
        disabled={chosen.length === 0}
        className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white active:bg-teal-700 disabled:opacity-40"
      >
        Impor {chosen.length} transaksi
      </button>
    </div>
  )
}
