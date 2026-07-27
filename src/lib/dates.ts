import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import { id } from 'date-fns/locale'

export type PeriodKind = 'weekly' | 'monthly' | 'yearly'

export interface Period {
  kind: PeriodKind
  start: Date
  end: Date
  label: string
}

export function toDateStr(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function fmtDate(d: Date | string, pattern = 'd MMM yyyy'): string {
  const date = typeof d === 'string' ? new Date(`${d}T00:00:00`) : d
  return format(date, pattern, { locale: id })
}

/** Periode dengan offset: 0 = berjalan, -1 = sebelumnya, dst. */
export function getPeriod(kind: PeriodKind, offset: number, now = new Date()): Period {
  if (kind === 'weekly') {
    const ref = addWeeks(now, offset)
    const start = startOfWeek(ref, { weekStartsOn: 1 })
    const end = endOfWeek(ref, { weekStartsOn: 1 })
    return {
      kind,
      start,
      end,
      label: `${format(start, 'd MMM', { locale: id })} – ${format(end, 'd MMM yyyy', { locale: id })}`,
    }
  }
  if (kind === 'monthly') {
    const ref = addMonths(now, offset)
    return {
      kind,
      start: startOfMonth(ref),
      end: endOfMonth(ref),
      label: format(ref, 'MMMM yyyy', { locale: id }),
    }
  }
  const ref = addYears(now, offset)
  return {
    kind,
    start: startOfYear(ref),
    end: endOfYear(ref),
    label: format(ref, 'yyyy'),
  }
}

/** Jumlah hari periode yang sudah berjalan (dibatasi hari ini). */
export function daysElapsedIn(period: Period, now = new Date()): number {
  if (now < period.start) return 0
  const end = now < period.end ? now : period.end
  return differenceInCalendarDays(end, period.start) + 1
}

export function inPeriod(dateStr: string, period: Period): boolean {
  return dateStr >= toDateStr(period.start) && dateStr <= toDateStr(period.end)
}

/** Daftar tanggal (yyyy-MM-dd) n hari terakhir termasuk hari ini. */
export function lastNDays(n: number, now = new Date()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(toDateStr(addDays(now, -i)))
  return out
}
