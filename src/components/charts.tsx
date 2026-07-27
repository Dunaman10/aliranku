import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatIDR, formatShort } from '../lib/money'

const AXIS_TICK = { fill: 'var(--chart-muted)', fontSize: 11 }

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-stone-800 px-3 py-2 text-xs text-white shadow-lg dark:bg-stone-700">
      {label != null && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          {p.color && (
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
          )}
          <span>{p.name}:</span>
          <span className="font-semibold">
            {typeof p.value === 'number' ? formatIDR(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Grafik batang pemasukan vs pengeluaran per sub-periode (laporan). */
export function IncomeExpenseBars({
  data,
}: {
  data: Array<{ label: string; masuk: number; keluar: number }>
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="var(--chart-grid)"
          strokeDasharray="0"
        />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={AXIS_TICK}
          tickFormatter={(v: number) => formatShort(v)}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
        <Bar
          dataKey="masuk"
          name="Masuk"
          fill="var(--chart-income)"
          radius={[4, 4, 0, 0]}
          maxBarSize={18}
        />
        <Bar
          dataKey="keluar"
          name="Keluar"
          fill="var(--chart-expense)"
          radius={[4, 4, 0, 0]}
          maxBarSize={18}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Donat komposisi pengeluaran per kategori (laporan). */
export function ExpenseDonut({
  data,
  total,
}: {
  data: Array<{ name: string; value: number; color: string }>
  total: number
}) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Tooltip content={<ChartTooltip />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={85}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] text-stone-500 dark:text-stone-400">
          Total keluar
        </span>
        <span className="text-sm font-bold">{formatIDR(total)}</span>
      </div>
    </div>
  )
}

/** Riwayat skor kesehatan finansial per periode (garis, 0–100). */
export function ScoreLine({
  data,
}: {
  data: Array<{ label: string; skor: number | null }>
}) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 40, 60, 80, 100]}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={30}
        />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="skor"
          name="Skor"
          stroke="var(--chart-score)"
          strokeWidth={2}
          dot={{ r: 4, fill: 'var(--chart-score)', strokeWidth: 0 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
