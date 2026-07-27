import Dexie, { type EntityTable } from 'dexie'

export type AccountType = 'cash' | 'bank' | 'ewallet' | 'investasi'

export interface Account {
  id: number
  name: string
  type: AccountType
  initialBalance: number
  createdAt: number
}

export type CategoryNature = 'need' | 'want' | null

export interface Category {
  id: number
  name: string
  type: 'income' | 'expense'
  /** Kebutuhan/keinginan — bahan analisis 50/30/20 (hanya untuk pengeluaran) */
  nature: CategoryNature
  icon: string
  color: string
  /** Kata kunci auto-kategorisasi impor CSV — belajar dari koreksi pengguna */
  keywords?: string[]
}

export type TxType = 'income' | 'expense' | 'transfer'

export interface Tx {
  id: number
  type: TxType
  amount: number
  categoryId?: number
  accountId: number
  /** Akun tujuan — hanya untuk transfer antar akun */
  toAccountId?: number
  /** Format yyyy-MM-dd */
  date: string
  note?: string
  /** true jika dibuat otomatis oleh transaksi berulang */
  isRecurring?: boolean
  createdAt: number
  updatedAt: number
}

export interface Budget {
  id: number
  categoryId: number
  amountPerMonth: number
}

export interface Recurring {
  id: number
  name: string
  type: 'income' | 'expense'
  amount: number
  categoryId?: number
  accountId: number
  /** Tanggal jatuh tempo tiap bulan (1–31, di-clamp ke akhir bulan pendek) */
  dayOfMonth: number
  /** Eksekusi berikutnya, format yyyy-MM-dd */
  nextRun: string
  active: boolean
}

export interface Goal {
  id: number
  name: string
  targetAmount: number
  savedAmount: number
  deadline?: string
  createdAt: number
}

export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('aliranku') as Dexie & {
  accounts: EntityTable<Account, 'id'>
  categories: EntityTable<Category, 'id'>
  transactions: EntityTable<Tx, 'id'>
  budgets: EntityTable<Budget, 'id'>
  recurring: EntityTable<Recurring, 'id'>
  goals: EntityTable<Goal, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  accounts: '++id, name, type',
  categories: '++id, name, type',
  transactions: '++id, date, type, accountId, categoryId, toAccountId',
})

db.version(2).stores({
  budgets: '++id, categoryId',
  recurring: '++id, nextRun',
  goals: '++id',
  settings: 'key',
})

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

const DEFAULT_EXPENSE: Array<[string, CategoryNature, string, string]> = [
  ['Makanan & Minum', 'need', 'utensils', 'blue'],
  ['Transportasi', 'need', 'bus', 'orange'],
  ['Tagihan & Utilitas', 'need', 'receipt', 'aqua'],
  ['Belanja', 'want', 'shopping-bag', 'yellow'],
  ['Hiburan', 'want', 'clapperboard', 'magenta'],
  ['Kesehatan', 'need', 'heart-pulse', 'green'],
  ['Pendidikan', 'need', 'graduation-cap', 'violet'],
  ['Lainnya', null, 'circle-dashed', 'gray'],
]

const DEFAULT_INCOME: Array<[string, string, string]> = [
  ['Gaji', 'banknote', 'blue'],
  ['Bonus', 'sparkles', 'aqua'],
  ['Bisnis/Freelance', 'briefcase', 'orange'],
  ['Hadiah', 'gift', 'magenta'],
  ['Lainnya', 'circle-dashed', 'gray'],
]

db.on('populate', (tx) => {
  const now = Date.now()
  tx.table('categories').bulkAdd([
    ...DEFAULT_EXPENSE.map(([name, nature, icon, color]) => ({
      name,
      type: 'expense',
      nature,
      icon,
      color,
    })),
    ...DEFAULT_INCOME.map(([name, icon, color]) => ({
      name,
      type: 'income',
      nature: null,
      icon,
      color,
    })),
  ])
  tx.table('accounts').add({
    name: 'Cash',
    type: 'cash',
    initialBalance: 0,
    createdAt: now,
  })
})
