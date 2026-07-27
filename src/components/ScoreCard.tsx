import type { Insight, ScoreResult } from '../lib/score'
import { TONE_COLORS } from './meta'
import { Card } from './ui'

function Ring({ score, color }: { score: number; color: string }) {
  const r = 32
  const c = 2 * Math.PI * r
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        strokeWidth="8"
        className="stroke-stone-200 dark:stroke-stone-800"
      />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 44 44)"
      />
      <text
        x="44"
        y="44"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-stone-900 text-2xl font-bold dark:fill-white"
      >
        {score}
      </text>
    </svg>
  )
}

/**
 * Kartu Skor Kesehatan Finansial.
 * `pending` menggantikan skor saat data belum cukup (PRD 7.4).
 */
export default function ScoreCard({
  result,
  insights,
  pending,
}: {
  result: ScoreResult | null
  insights: Insight[]
  pending?: string
}) {
  return (
    <Card>
      <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
        Skor Kesehatan Finansial
      </p>
      {pending || !result || result.status !== 'ok' ? (
        <p className="py-3 text-sm text-stone-600 dark:text-stone-300">
          {pending ??
            (result?.status === 'no-income'
              ? 'Belum ada pemasukan tercatat bulan ini — skor menunggu pemasukan pertamamu.'
              : 'Belum ada transaksi. Catat yang pertama, yuk!')}
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <Ring score={result.score} color={TONE_COLORS[result.tone]} />
          <div className="min-w-0">
            <p className="text-lg font-bold">
              {result.label} {result.emoji}
            </p>
            {insights[0] && (
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                {insights[0].text}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
