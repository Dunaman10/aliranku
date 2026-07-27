import { formatIDR } from '../lib/money'

/**
 * Grafik mini tren pengeluaran 7 hari (dashboard) — SVG ringan tanpa
 * Recharts, agar bundle awal tetap kecil (Recharts hanya dimuat di Laporan).
 */
export default function MiniBars({
  data,
}: {
  data: Array<{ label: string; keluar: number }>
}) {
  const max = Math.max(...data.map((d) => d.keluar), 1)
  return (
    <div className="flex items-end gap-2 pt-2" style={{ height: 110 }}>
      {data.map((d, i) => (
        <div
          key={i}
          className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
          title={`${d.label}: ${formatIDR(d.keluar)}`}
        >
          <div
            className="w-full max-w-6 rounded-t-[4px]"
            style={{
              backgroundColor:
                d.keluar > 0 ? 'var(--chart-expense)' : 'var(--chart-grid)',
              height: d.keluar > 0 ? `${Math.max((d.keluar / max) * 80, 3)}px` : '3px',
            }}
          />
          <span className="text-[11px] text-[var(--chart-muted)]">{d.label}</span>
        </div>
      ))}
    </div>
  )
}
