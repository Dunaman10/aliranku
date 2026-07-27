import { addMonths, format, lastDayOfMonth, setDate } from 'date-fns'
import { db, type Recurring, type Tx } from '../db'
import { toDateStr } from './dates'

/** Tanggal `dayOfMonth` pada bulan `ref`, di-clamp ke akhir bulan pendek. */
function clampToMonth(ref: Date, dayOfMonth: number): Date {
  const last = lastDayOfMonth(ref).getDate()
  return setDate(ref, Math.min(dayOfMonth, last))
}

/** Eksekusi pertama: bulan ini jika belum lewat, kalau sudah → bulan depan. */
export function firstRun(dayOfMonth: number, now = new Date()): string {
  const thisMonth = clampToMonth(now, dayOfMonth)
  const run =
    format(thisMonth, 'yyyy-MM-dd') >= toDateStr(now)
      ? thisMonth
      : clampToMonth(addMonths(now, 1), dayOfMonth)
  return toDateStr(run)
}

/** Eksekusi berikutnya setelah `current` (yyyy-MM-dd). */
export function nextRunAfter(current: string, dayOfMonth: number): string {
  const cur = new Date(`${current}T00:00:00`)
  return toDateStr(clampToMonth(addMonths(cur, 1), dayOfMonth))
}

let processing: Promise<number> | null = null

/**
 * Catat otomatis semua transaksi berulang yang jatuh tempo (PRD 6.8).
 * Aman dipanggil berulang (StrictMode/dobel-mount) — di-guard satu promise.
 */
export function processRecurring(): Promise<number> {
  if (!processing) processing = run().finally(() => (processing = null))
  return processing
}

async function run(): Promise<number> {
  const today = toDateStr(new Date())
  const due = await db.recurring.where('nextRun').belowOrEqual(today).toArray()
  let added = 0
  for (const r of due) {
    let next = r.nextRun
    let guard = 0
    const now = Date.now()
    // Catat semua kejadian yang terlewat (catch-up), maksimal 36 bulan
    while (next <= today && guard++ < 36) {
      if (r.active) {
        await db.transactions.add({
          type: r.type,
          amount: r.amount,
          categoryId: r.categoryId,
          accountId: r.accountId,
          date: next,
          note: r.name,
          isRecurring: true,
          createdAt: now,
          updatedAt: now,
        } as Tx)
        added++
      }
      next = nextRunAfter(next, r.dayOfMonth)
    }
    await db.recurring.update(r.id, { nextRun: next })
  }
  return added
}

/** Lewati satu kejadian berikutnya tanpa mencatat transaksi. */
export async function skipOnce(r: Recurring): Promise<void> {
  await db.recurring.update(r.id, {
    nextRun: nextRunAfter(r.nextRun, r.dayOfMonth),
  })
}
