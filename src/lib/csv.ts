import type { Account, Category, Tx } from '../db'

const TYPE_LABEL: Record<Tx['type'], string> = {
  income: 'Pemasukan',
  expense: 'Pengeluaran',
  transfer: 'Transfer',
}

function cell(v: string | number | undefined): string {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Export transaksi ke CSV (pemisah ";" agar langsung rapi di Excel id-ID,
 * plus BOM supaya karakter Indonesia terbaca benar).
 */
export function transactionsToCSV(
  txs: Tx[],
  categories: Map<number, Category>,
  accounts: Map<number, Account>,
): string {
  const header = [
    'Tanggal',
    'Tipe',
    'Nominal',
    'Kategori',
    'Akun',
    'Akun Tujuan',
    'Catatan',
    'Otomatis',
  ]
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((t) =>
      [
        t.date,
        TYPE_LABEL[t.type],
        t.amount,
        t.categoryId != null ? (categories.get(t.categoryId)?.name ?? '') : '',
        accounts.get(t.accountId)?.name ?? '',
        t.toAccountId != null ? (accounts.get(t.toAccountId)?.name ?? '') : '',
        t.note ?? '',
        t.isRecurring ? 'ya' : '',
      ]
        .map(cell)
        .join(';'),
    )
  return `﻿${header.join(';')}\n${rows.join('\n')}`
}
