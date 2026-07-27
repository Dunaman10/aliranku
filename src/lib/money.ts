const fmt = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

const fmtPlain = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

/** 50000 → "Rp 50.000" */
export function formatIDR(n: number): string {
  return fmt.format(n).replace(/ /g, ' ')
}

/** 50000 → "50.000" (tanpa "Rp") */
export function formatNumber(n: number): string {
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
