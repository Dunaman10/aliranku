import type { Budget, Category, Tx } from '../db'

export interface BudgetStatus {
  budget: Budget
  category?: Category
  spent: number
  /** spent ÷ limit (bisa > 1 jika jebol) */
  ratio: number
}

/** Status budget bulan berjalan per kategori (dipakai dashboard, skor, insight). */
export function budgetStatuses(
  budgets: Budget[],
  monthTxs: Tx[],
  categories: Map<number, Category>,
): BudgetStatus[] {
  const spentByCat = new Map<number, number>()
  for (const t of monthTxs) {
    if (t.type !== 'expense' || t.categoryId == null) continue
    spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) ?? 0) + t.amount)
  }
  return budgets
    .filter((b) => b.amountPerMonth > 0)
    .map((b) => {
      const spent = spentByCat.get(b.categoryId) ?? 0
      return {
        budget: b,
        category: categories.get(b.categoryId),
        spent,
        ratio: spent / b.amountPerMonth,
      }
    })
    .sort((a, b) => b.ratio - a.ratio)
}
