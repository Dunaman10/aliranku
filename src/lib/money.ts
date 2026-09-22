const fmt = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

const fmtPlain = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

/** 50000 → "Rp 50.000" atau "Rp ••••••" jika hidden */
export function formatIDR(n: number, hidden = false): string {
  if (hidden) return 'Rp ••••••'
  return fmt.format(n).replace(/ /g, ' ')
}

/** 50000 → "50.000" (tanpa "Rp") */
export function formatNumber(n: number, hidden = false): string {
  if (hidden) return '••••••'
  return fmtPlain.format(n)
}

/** Ringkas untuk sumbu grafik: 1500000 → "1,5 jt" */
export function formatShort(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)} M`
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)} jt`
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)} rb`
  return `${sign}${abs}`
}

function trim(v: number): string {
  return v.toFixed(1).replace('.0', '').replace('.', ',')
}

/** Format jumlah koin kripto tanpa pembulatan kasar ke 0 (mis. 0,0054321 BTC) */
export function formatCryptoAmount(amount: number, symbol?: string): string {
  if (!Number.isFinite(amount)) return symbol ? `0 ${symbol.toUpperCase()}` : '0'
  const maxDecimals =
    amount < 0.0001 ? 8 : amount < 0.01 ? 6 : amount < 1 ? 4 : amount < 1000 ? 2 : 0
  const formatted = amount.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  })
  return symbol ? `${formatted} ${symbol.toUpperCase()}` : formatted
}

/** Format persentase profit/loss (mis. +5,24% atau -2,10%) */
export function formatPercent(p: number, includeSign = true): string {
  if (!Number.isFinite(p)) return '0,00%'
  const sign = includeSign && p > 0 ? '+' : ''
  return `${sign}${p.toFixed(2).replace('.', ',')}%`
}

