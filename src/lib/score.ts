import type { Category, Tx } from '../db'
import type { BudgetStatus } from './budget'

/**
 * Skor Kesehatan Finansial (PRD Bagian 7).
 *
 * Bobot penuh: menabung 40, disiplin budget 25, struktur 20, konsistensi 15.
 * Jika pengguna belum menyetel budget sama sekali, bobot "Disiplin budget"
 * didistribusikan proporsional ke tiga komponen lain (aturan PRD 7.1):
 *   Rasio menabung  40 → 40 + 25×(40/75) = 53,33
 *   Struktur 50/30/20 20 → 20 + 25×(20/75) = 26,67
 *   Konsistensi     15 → 15 + 25×(15/75) = 20
 */
const W_SAVING = 40
const W_BUDGET = 25
const W_STRUCTURE = 20
const W_CONSISTENCY = 15

const SAVING_TARGET = 0.2 // poin penuh jika menabung ≥ 20% pemasukan
const NEEDS_LIMIT = 0.5
const WANTS_LIMIT = 0.3
const CONSISTENCY_TARGET = 5 / 7 // ≥ 5 hari per minggu

export interface ScoreComponent {
  key: 'saving' | 'budget' | 'structure' | 'consistency'
  label: string
  weight: number
  points: number
}

export type ScoreStatus = 'ok' | 'no-income' | 'no-data'

export interface ScoreResult {
  status: ScoreStatus
  score: number
  label: string
  emoji: string
  /** Slug warna: green | yellow | orange | red */
  tone: 'green' | 'yellow' | 'orange' | 'red'
  components: ScoreComponent[]
  income: number
  expense: number
  savingRatio: number
  needsRatio: number
  wantsRatio: number
  recordedDays: number
  daysElapsed: number
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function scoreLabel(score: number) {
  if (score >= 80) return { label: 'Sehat', emoji: '🟢', tone: 'green' as const }
  if (score >= 60) return { label: 'Cukup Baik', emoji: '🟡', tone: 'yellow' as const }
  if (score >= 40) return { label: 'Perlu Perhatian', emoji: '🟠', tone: 'orange' as const }
  return { label: 'Boros / Bahaya', emoji: '🔴', tone: 'red' as const }
}

/**
 * Hitung skor untuk satu periode. `txs` = transaksi dalam periode tsb
 * (transfer otomatis diabaikan — bukan pemasukan/pengeluaran).
 * `budgetStats` hanya relevan untuk periode bulanan (budget bersifat bulanan).
 */
export function computeScore(
  txs: Tx[],
  categories: Map<number, Category>,
  daysElapsed: number,
  budgetStats: BudgetStatus[] = [],
): ScoreResult {
  let income = 0
  let expense = 0
  let needs = 0
  let wants = 0
  const days = new Set<string>()

  for (const t of txs) {
    days.add(t.date)
    if (t.type === 'income') income += t.amount
    else if (t.type === 'expense') {
      expense += t.amount
      const nature = t.categoryId != null ? categories.get(t.categoryId)?.nature : null
      if (nature === 'need') needs += t.amount
      else if (nature === 'want') wants += t.amount
    }
  }

  const recordedDays = days.size
  const base = {
    income,
    expense,
    recordedDays,
    daysElapsed,
    savingRatio: 0,
    needsRatio: 0,
    wantsRatio: 0,
  }

  if (txs.length === 0) {
    return {
      ...base,
      status: 'no-data',
      score: 0,
      label: 'Belum ada data',
      emoji: '⬜',
      tone: 'yellow',
      components: [],
    }
  }

  // Edge case PRD 7.4: pemasukan = 0 → jangan tampilkan skor rendah menyesatkan
  if (income === 0) {
    return {
      ...base,
      status: 'no-income',
      score: 0,
      label: 'Belum ada pemasukan',
      emoji: '⏳',
      tone: 'yellow',
      components: [],
    }
  }

  const savingRatio = (income - expense) / income
  // Defisit → komponen menabung = 0
  const savingScore = savingRatio <= 0 ? 0 : clamp01(savingRatio / SAVING_TARGET)

  const needsRatio = needs / income
  const wantsRatio = wants / income
  // Proporsional: penalti linear untuk kelebihan dari batas (habis di 2× batas)
  const needsScore =
    needsRatio <= NEEDS_LIMIT ? 1 : clamp01(1 - (needsRatio - NEEDS_LIMIT) / NEEDS_LIMIT)
  const wantsScore =
    wantsRatio <= WANTS_LIMIT ? 1 : clamp01(1 - (wantsRatio - WANTS_LIMIT) / WANTS_LIMIT)
  const structureScore = (needsScore + wantsScore) / 2

  const consistencyScore =
    daysElapsed <= 0 ? 0 : clamp01(recordedDays / daysElapsed / CONSISTENCY_TARGET)

  // Disiplin budget: % kategori ber-budget yang tidak jebol. Tanpa budget,
  // bobotnya didistribusikan proporsional ke tiga komponen lain.
  const hasBudgets = budgetStats.length > 0
  const budgetScore = hasBudgets
    ? budgetStats.filter((b) => b.ratio <= 1).length / budgetStats.length
    : 0
  const spread = hasBudgets ? 0 : W_BUDGET / (W_SAVING + W_STRUCTURE + W_CONSISTENCY)

  const components: ScoreComponent[] = [
    {
      key: 'saving',
      label: 'Rasio menabung',
      weight: W_SAVING * (1 + spread),
      points: W_SAVING * (1 + spread) * savingScore,
    },
    ...(hasBudgets
      ? [
          {
            key: 'budget' as const,
            label: 'Disiplin budget',
            weight: W_BUDGET,
            points: W_BUDGET * budgetScore,
          },
        ]
      : []),
    {
      key: 'structure',
      label: 'Struktur 50/30/20',
      weight: W_STRUCTURE * (1 + spread),
      points: W_STRUCTURE * (1 + spread) * structureScore,
    },
    {
      key: 'consistency',
      label: 'Konsistensi mencatat',
      weight: W_CONSISTENCY * (1 + spread),
      points: W_CONSISTENCY * (1 + spread) * consistencyScore,
    },
  ]

  const score = Math.round(components.reduce((s, c) => s + c.points, 0))
  return {
    ...base,
    savingRatio,
    needsRatio,
    wantsRatio,
    status: 'ok',
    score,
    ...scoreLabel(score),
    components,
  }
}

export interface Insight {
  tone: 'bad' | 'warn' | 'good'
  text: string
}

/** Insight otomatis berbasis aturan (PRD 7.3) — maksimal 3 paling relevan. */
export function computeInsights(
  result: ScoreResult,
  txs: Tx[],
  prevTxs: Tx[],
  categories: Map<number, Category>,
  formatIDR: (n: number) => string,
  budgetStats: BudgetStatus[] = [],
): Insight[] {
  const out: Insight[] = []
  if (result.status !== 'ok') return out

  const pct = (v: number) => `${Math.round(v * 100)}%`

  // 1. Defisit
  if (result.expense > result.income) {
    out.push({
      tone: 'bad',
      text: `Pengeluaranmu melebihi pemasukan — defisit ${formatIDR(result.expense - result.income)}. Rem dulu, yuk!`,
    })
  }

  // 1b. Budget kategori jebol (yang paling parah)
  const busted = budgetStats.filter((b) => b.ratio > 1)
  if (busted[0]) {
    const b = busted[0]
    out.push({
      tone: 'bad',
      text: `Budget ${b.category?.name ?? 'kategori'} sudah terlampaui ${formatIDR(b.spent - b.budget.amountPerMonth)}.`,
    })
  }

  // 2. Rasio menabung < 10%
  if (result.savingRatio >= 0 && result.savingRatio < 0.1) {
    out.push({
      tone: 'warn',
      text: `Kamu baru menyisihkan ${pct(result.savingRatio)} dari pemasukan. Target sehat: minimal 20%.`,
    })
  }

  // 3. Keinginan > 30% pemasukan
  if (result.wantsRatio > WANTS_LIMIT) {
    out.push({
      tone: 'warn',
      text: `${pct(result.wantsRatio)} pemasukanmu habis untuk keinginan, melebihi batas ideal 30%.`,
    })
  }

  // 4. Kategori naik > 30% vs periode lalu
  const sumByCat = (list: Tx[]) => {
    const m = new Map<number, number>()
    for (const t of list) {
      if (t.type !== 'expense' || t.categoryId == null) continue
      m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount)
    }
    return m
  }
  const cur = sumByCat(txs)
  const prev = sumByCat(prevTxs)
  let spike: { name: string; up: number } | null = null
  for (const [catId, amount] of cur) {
    const before = prev.get(catId) ?? 0
    if (before <= 0) continue
    const up = (amount - before) / before
    if (up > 0.3 && (!spike || up > spike.up)) {
      const name = categories.get(catId)?.name ?? 'Lainnya'
      spike = { name, up }
    }
  }
  if (spike) {
    out.push({
      tone: 'warn',
      text: `Pengeluaran ${spike.name} naik ${Math.round(spike.up * 100)}% dibanding periode lalu.`,
    })
  }

  // 5. Semua sehat
  if (out.length === 0 && result.savingRatio >= SAVING_TARGET) {
    out.push({
      tone: 'good',
      text: `Mantap! Kamu menyisihkan ${pct(result.savingRatio)} pemasukan periode ini.`,
    })
  }

  return out.slice(0, 3)
}
