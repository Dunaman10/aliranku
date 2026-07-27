import type { Category, Tx } from '../db'

/* ---------- Parser CSV ---------- */

export interface ParsedCSV {
  headers: string[]
  rows: string[][]
  delimiter: string
}

function detectDelimiter(line: string): string {
  let best = ','
  let bestCount = 0
  for (const d of [';', ',', '\t']) {
    const count = line.split(d).length - 1
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

/** Parser CSV dengan dukungan tanda kutip (termasuk newline di dalam kutip). */
export function parseCSV(text: string): ParsedCSV {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const delimiter = detectDelimiter(firstLine)

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delimiter) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((v) => v.trim() !== '')) rows.push(row)

  // Cari baris header: baris pertama yang cocok dengan ≥2 nama kolom umum
  // (e-statement bank sering punya baris pembuka sebelum tabelnya).
  const HEADERish =
    /tanggal|date|tgl|waktu|keterangan|deskripsi|description|catatan|berita|nominal|amount|jumlah|mutasi|debit|kredit|credit|saldo|balance/i
  let headerIdx = 0
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const hits = rows[i].filter((cll) => HEADERish.test(cll)).length
    if (hits >= 2) {
      headerIdx = i
      break
    }
  }
  return {
    headers: rows[headerIdx]?.map((h) => h.trim()) ?? [],
    rows: rows.slice(headerIdx + 1),
    delimiter,
  }
}

/* ---------- Parser nilai ---------- */

/** "Rp 1.234.567,89" / "1,234,567.89" / "(50.000)" → angka rupiah bulat. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim()
  if (!s) return null
  const neg = /^\(.*\)$/.test(s) || /-/.test(s)
  s = s.replace(/[^\d.,]/g, '')
  if (!s) return null

  const lastDot = s.lastIndexOf('.')
  const lastCom = s.lastIndexOf(',')
  let decimalSep = ''
  if (lastDot !== -1 && lastCom !== -1) {
    decimalSep = lastDot > lastCom ? '.' : ','
  } else {
    const sep = lastDot !== -1 ? '.' : lastCom !== -1 ? ',' : ''
    if (sep) {
      const parts = s.split(sep)
      // Satu pemisah dengan 1–2 digit di belakang → desimal; selain itu ribuan
      if (parts.length === 2 && parts[1].length <= 2) decimalSep = sep
    }
  }
  let normalized = s
  if (decimalSep) {
    const thousand = decimalSep === '.' ? ',' : '.'
    normalized = s.split(thousand).join('').replace(decimalSep, '.')
  } else {
    normalized = s.replace(/[.,]/g, '')
  }
  const v = Number.parseFloat(normalized)
  if (!Number.isFinite(v)) return null
  return Math.round(neg ? -v : v)
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MEI: 5, MAY: 5, JUN: 6, JUL: 7,
  AGT: 8, AGU: 8, AUG: 8, SEP: 9, OKT: 10, OCT: 10, NOV: 11, DES: 12, DEC: 12,
}

/** Berbagai format tanggal bank → yyyy-MM-dd (null jika tak dikenali). */
export function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const valid = (y: number, m: number, d: number) =>
    y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31
      ? `${y}-${pad(m)}-${pad(d)}`
      : null

  // "26 Jul 2026" / "26 Agustus 2026"
  const mmm = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\w*\.?\s+(\d{4})/)
  if (mmm) {
    const m = MONTHS[mmm[2].slice(0, 3).toUpperCase()]
    if (m) return valid(Number(mmm[3]), m, Number(mmm[1]))
  }

  const token = s.split(/\s+/)[0]
  // yyyy-MM-dd / yyyy/MM/dd
  let m = token.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]))
  // dd/MM/yyyy / dd-MM-yyyy
  m = token.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (m) return valid(Number(m[3]), Number(m[2]), Number(m[1]))
  // dd/MM/yy
  m = token.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/)
  if (m) return valid(2000 + Number(m[3]), Number(m[2]), Number(m[1]))
  return null
}

/* ---------- Deteksi kolom ---------- */

export interface ColumnGuess {
  date: number
  desc: number
  amount: number
  debit: number
  credit: number
  /** Kolom penanda DB/CR (opsional) */
  dcFlag: number
}

export function guessColumns(headers: string[]): ColumnGuess {
  const find = (re: RegExp) => headers.findIndex((h) => re.test(h))
  return {
    date: find(/tanggal|date|tgl|waktu|time/i),
    desc: find(/keterangan|deskripsi|description|catatan|berita|detail|transaksi|merchant|note/i),
    amount: find(/nominal|amount|jumlah|mutasi|nilai/i),
    debit: find(/debit|keluar(?!.*masuk)/i),
    credit: find(/kredit|credit|masuk/i),
    dcFlag: find(/^(d\/k|db\/cr|tipe|type|jenis)$/i),
  }
}

/* ---------- Auto-kategorisasi ---------- */

/** Aturan bawaan: kata kunci → nama kategori bawaan (PRD 6.13). */
const BUILTIN_RULES: Array<[string, string[]]> = [
  ['Makanan & Minum', ['GOFOOD', 'GRABFOOD', 'SHOPEEFOOD', 'MCD', 'MCDONALD', 'KFC', 'STARBUCKS', 'KOPI', 'COFFEE', 'RESTO', 'WARUNG', 'BAKERY', 'FOOD']],
  ['Transportasi', ['GOJEK', 'GORIDE', 'GOCAR', 'GRAB', 'BLUEBIRD', 'MRT', 'TRANSJAKARTA', 'KRL', 'COMMUTER', 'PERTAMINA', 'SHELL', 'BENSIN', 'PARKIR', 'TOL', 'KAI', 'TIKET']],
  ['Tagihan & Utilitas', ['PLN', 'LISTRIK', 'PDAM', 'INDIHOME', 'TELKOMSEL', 'INDOSAT', 'SMARTFREN', 'BYU', 'PULSA', 'PAKET DATA', 'BPJS', 'WIFI', 'FIRSTMEDIA', 'BIZNET']],
  ['Belanja', ['TOKOPEDIA', 'SHOPEE', 'LAZADA', 'BLIBLI', 'ALFAMART', 'INDOMARET', 'ALFAMIDI', 'UNIQLO', 'MINISO', 'ACE']],
  ['Hiburan', ['NETFLIX', 'SPOTIFY', 'YOUTUBE', 'DISNEY', 'VIDIO', 'WETV', 'CGV', 'XXI', 'CINEPOLIS', 'STEAM', 'PLAYSTATION', 'GAME']],
  ['Kesehatan', ['APOTEK', 'APOTIK', 'KIMIA FARMA', 'HALODOC', 'ALODOKTER', 'KLINIK', 'RUMAH SAKIT', 'GUARDIAN']],
  ['Pendidikan', ['UDEMY', 'COURSERA', 'RUANGGURU', 'GRAMEDIA', 'BUKU', 'KAMPUS', 'SPP']],
  ['Gaji', ['GAJI', 'SALARY', 'PAYROLL']],
]

/**
 * Tebak kategori dari deskripsi: kata kunci hasil koreksi pengguna
 * (category.keywords) menang atas aturan bawaan.
 */
export function guessCategory(
  desc: string,
  kind: 'income' | 'expense',
  categories: Category[],
): number | undefined {
  const upper = desc.toUpperCase()
  const pool = categories.filter((c) => c.type === kind)
  for (const c of pool) {
    if (c.keywords?.some((k) => k && upper.includes(k.toUpperCase()))) return c.id
  }
  for (const [name, words] of BUILTIN_RULES) {
    const cat = pool.find((c) => c.name === name)
    if (cat && words.some((w) => upper.includes(w))) return cat.id
  }
  return undefined
}

const STOPWORDS = new Set([
  'TRANSFER', 'PEMBAYARAN', 'PAYMENT', 'TRANSAKSI', 'PEMBELIAN', 'BIAYA',
  'ADMIN', 'VIRTUAL', 'ACCOUNT', 'DARI', 'UNTUK', 'KEPADA', 'QRIS', 'DEBIT',
  'KREDIT', 'BANK', 'DENGAN',
])

/** Kata kunci yang dipelajari dari koreksi pengguna: token bermakna pertama. */
export function extractKeyword(desc: string): string | null {
  const tokens = desc.toUpperCase().split(/[^A-Z]+/)
  for (const t of tokens) {
    if (t.length >= 4 && !STOPWORDS.has(t)) return t
  }
  return null
}

/* ---------- Baris hasil parsing untuk layar review ---------- */

export interface ImportRow {
  date: string
  desc: string
  amount: number
  kind: 'income' | 'expense'
  categoryId?: number
  /** Kategori tebakan awal — untuk mendeteksi koreksi pengguna */
  guessedId?: number
  /** true = tanggal+nominal+deskripsi sama persis dengan transaksi lama */
  exactDup: boolean
  /** true = tanggal+nominal sama dengan transaksi lama (mungkin duplikat) */
  softDup: boolean
  include: boolean
}

export type AmountMode = 'signed' | 'flag' | 'two-col'

export function buildRows(
  parsed: ParsedCSV,
  cols: ColumnGuess,
  mode: AmountMode,
  categories: Category[],
  existing: Tx[],
): { rows: ImportRow[]; skipped: number } {
  const exactKeys = new Set(
    existing.map(
      (t) => `${t.date}|${t.amount}|${(t.note ?? '').trim().toLowerCase()}`,
    ),
  )
  const softKeys = new Set(
    existing
      .filter((t) => t.type !== 'transfer')
      .map((t) => `${t.date}|${t.amount}`),
  )
  const seen = new Set<string>()
  const rows: ImportRow[] = []
  let skipped = 0

  for (const r of parsed.rows) {
    const date = cols.date >= 0 ? parseDate(r[cols.date] ?? '') : null
    const desc = (cols.desc >= 0 ? (r[cols.desc] ?? '') : '').trim()
    let amount: number | null = null
    let kind: 'income' | 'expense' = 'expense'

    if (mode === 'two-col') {
      const debit = cols.debit >= 0 ? parseAmount(r[cols.debit] ?? '') : null
      const credit = cols.credit >= 0 ? parseAmount(r[cols.credit] ?? '') : null
      if (debit && debit !== 0) {
        amount = Math.abs(debit)
        kind = 'expense'
      } else if (credit && credit !== 0) {
        amount = Math.abs(credit)
        kind = 'income'
      }
    } else {
      const v = cols.amount >= 0 ? parseAmount(r[cols.amount] ?? '') : null
      if (v != null && v !== 0) {
        amount = Math.abs(v)
        if (mode === 'flag' && cols.dcFlag >= 0) {
          kind = /^(d|db|debit|k(?!r)|keluar|out)/i.test((r[cols.dcFlag] ?? '').trim())
            ? 'expense'
            : 'income'
        } else {
          kind = v < 0 ? 'expense' : 'income'
        }
      }
    }

    if (!date || amount == null) {
      skipped++
      continue
    }

    const key = `${date}|${amount}|${desc.toLowerCase()}`
    const exactDup = exactKeys.has(key) || seen.has(key)
    seen.add(key)
    const guessedId = guessCategory(desc, kind, categories)
    rows.push({
      date,
      desc,
      amount,
      kind,
      categoryId: guessedId,
      guessedId,
      exactDup,
      softDup: !exactDup && softKeys.has(`${date}|${amount}`),
      include: !exactDup,
    })
  }
  return { rows, skipped }
}
