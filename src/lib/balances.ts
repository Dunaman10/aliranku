import type { Account, Tx } from '../db'

/** Saldo per akun = saldo awal + semua mutasi transaksi. */
export function computeBalances(accounts: Account[], txs: Tx[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const a of accounts) map.set(a.id, a.initialBalance)
  for (const t of txs) {
    if (t.type === 'income') {
      map.set(t.accountId, (map.get(t.accountId) ?? 0) + t.amount)
    } else if (t.type === 'expense') {
      map.set(t.accountId, (map.get(t.accountId) ?? 0) - t.amount)
    } else {
      // Transfer: hanya memindahkan saldo, bukan pemasukan/pengeluaran
      map.set(t.accountId, (map.get(t.accountId) ?? 0) - t.amount)
      if (t.toAccountId != null)
        map.set(t.toAccountId, (map.get(t.toAccountId) ?? 0) + t.amount)
    }
  }
  return map
}

/** Uang siap pakai (cash+bank+ewallet) vs nilai investasi — tidak dijumlah. */
export function splitBalances(accounts: Account[], balances: Map<number, number>) {
  let ready = 0
  let invest = 0
  for (const a of accounts) {
    const b = balances.get(a.id) ?? 0
    if (a.type === 'investasi') invest += b
    else ready += b
  }
  return { ready, invest }
}
