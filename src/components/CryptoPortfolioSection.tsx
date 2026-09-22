import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Edit3,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { formatCryptoAmount, formatIDR, formatPercent } from '../lib/money'
import { useIndodaxLive } from '../lib/useIndodaxLive'
import { useUI } from '../store'
import { Card } from './ui'

const COIN_GRADIENTS: Record<string, string> = {
  btc: 'from-amber-500 to-orange-600 text-white',
  eth: 'from-indigo-500 to-purple-600 text-white',
  usdt: 'from-emerald-500 to-teal-600 text-white',
  sol: 'from-violet-500 to-fuchsia-600 text-white',
  bnb: 'from-yellow-500 to-amber-600 text-white',
  doge: 'from-amber-400 to-yellow-500 text-stone-900',
  ada: 'from-blue-500 to-cyan-600 text-white',
  xrp: 'from-stone-700 to-stone-900 text-white',
}

function getCoinGradient(code: string): string {
  return COIN_GRADIENTS[code.toLowerCase()] || 'from-teal-600 to-emerald-700 text-white'
}

function timeAgo(timestamp: number | null): string {
  if (!timestamp) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (diffSec < 5) return 'Baru saja'
  if (diffSec < 60) return `${diffSec} dtk lalu`
  const diffMin = Math.floor(diffSec / 60)
  return `${diffMin} mnt lalu`
}

export default function CryptoPortfolioSection() {
  const { hideAmounts } = useUI()
  const {
    connected,
    isLive,
    loading,
    portfolio,
    lastSync,
    error,
    refreshNow,
    updateBuyPrice,
  } = useIndodaxLive()

  const [expanded, setExpanded] = useState<boolean>(true)
  const [editingCoin, setEditingCoin] = useState<{
    code: string
    name: string
    currentPrice: number
    amount: number
    buyPrice: number
  } | null>(null)
  const [modalInput, setModalInput] = useState<string>('')
  const [inputMode, setInputMode] = useState<'perUnit' | 'total'>('perUnit')

  // Jangan render jika belum terhubung
  if (!connected || !portfolio) return null

  const openEditModal = (
    code: string,
    name: string,
    currentPrice: number,
    amount: number,
    existingBuyPrice?: number,
  ) => {
    setEditingCoin({
      code,
      name,
      currentPrice,
      amount,
      buyPrice: existingBuyPrice || 0,
    })
    setInputMode('perUnit')
    setModalInput(existingBuyPrice ? String(existingBuyPrice) : '')
  }

  const handleSaveModal = async () => {
    if (!editingCoin) return
    const val = Number.parseFloat(modalInput.replace(/[^0-9.]/g, '')) || 0
    let perUnit = val
    if (inputMode === 'total' && editingCoin.amount > 0) {
      perUnit = Math.round(val / editingCoin.amount)
    }
    await updateBuyPrice(editingCoin.code, perUnit)
    setEditingCoin(null)
  }

  const handleRemoveModal = async () => {
    if (!editingCoin) return
    await updateBuyPrice(editingCoin.code, 0)
    setEditingCoin(null)
  }

  const hasAssets = portfolio.assets.length > 0

  return (
    <div className="space-y-2">
      <Card className="overflow-hidden !p-0 border border-teal-500/20 bg-gradient-to-b from-stone-900 via-stone-900 to-stone-950 text-white shadow-xl">
        {/* Header Section dengan Indikator Realtime */}
        <div className="flex items-center justify-between border-b border-stone-800/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-teal-500/20 text-teal-400">
              <Coins size={16} />
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                Portofolio Kripto
              </h2>
              <div className="flex items-center gap-1.5">
                {isLive ? (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
                    </span>
                    LIVE · {timeAgo(lastSync)}
                  </span>
                ) : (
                  <span className="text-[10px] text-stone-500">
                    Terakhir: {timeAgo(lastSync)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => refreshNow()}
              disabled={loading}
              title="Perbarui data sekarang"
              aria-label="Perbarui data"
              className="flex size-7 items-center justify-center rounded-lg bg-stone-800/80 text-stone-300 hover:bg-stone-700 hover:text-white disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex size-7 items-center justify-center rounded-lg bg-stone-800/80 text-stone-300 hover:bg-stone-700 hover:text-white"
            >
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>
        </div>

        {/* Hero Nilai Investasi & Ringkasan Profit/Loss */}
        <div className="p-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-xs text-stone-400">Total Nilai Investasi</p>
              <p className="text-2xl font-black tracking-tight text-white tabular-nums">
                {formatIDR(portfolio.totalIdr, hideAmounts)}
              </p>
            </div>
            {/* Badge Profit 24 Jam */}
            <div
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold ${
                portfolio.isProfit24h
                  ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30'
              }`}
            >
              {portfolio.isProfit24h ? (
                <ArrowUpRight size={14} className="shrink-0" />
              ) : (
                <ArrowDownRight size={14} className="shrink-0" />
              )}
              <span>{formatPercent(portfolio.pnl24hPercent)}</span>
              <span className="text-[10px] opacity-80">(24j)</span>
            </div>
          </div>

          {/* Sub-metrik: Kas IDR vs Aset Kripto */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-stone-800/50 p-2.5 ring-1 ring-white/5">
              <p className="text-[11px] text-stone-400">Kas Indodax (IDR)</p>
              <p className="font-semibold text-stone-200 tabular-nums">
                {formatIDR(portfolio.idr, hideAmounts)}
              </p>
            </div>
            <div className="rounded-xl bg-stone-800/50 p-2.5 ring-1 ring-white/5">
              <p className="text-[11px] text-stone-400">Total Koin Kripto</p>
              <p className="font-semibold text-teal-300 tabular-nums">
                {formatIDR(portfolio.cryptoIdr, hideAmounts)}
              </p>
            </div>
          </div>

          {/* Ringkasan Profit/Loss All-time jika modal diatur */}
          {portfolio.pnlAllTimeIdr != null && portfolio.totalCostIdr != null && (
            <div
              className={`mt-2 flex items-center justify-between rounded-xl p-2.5 text-xs ${
                portfolio.isProfitAllTime
                  ? 'bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-500/20'
                  : 'bg-rose-950/40 text-rose-300 ring-1 ring-rose-500/20'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {portfolio.isProfitAllTime ? (
                  <TrendingUp size={14} className="text-emerald-400" />
                ) : (
                  <TrendingDown size={14} className="text-rose-400" />
                )}
                <span className="font-medium">
                  {portfolio.isProfitAllTime ? 'Total Untung' : 'Total Rugi'} (Modal:{' '}
                  {formatIDR(portfolio.totalCostIdr, hideAmounts)})
                </span>
              </div>
              <span className="font-bold tabular-nums">
                {formatIDR(portfolio.pnlAllTimeIdr, hideAmounts)} (
                {formatPercent(portfolio.pnlAllTimePercent ?? 0)})
              </span>
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-amber-400/90">{error}</p>
          )}
        </div>

        {/* Daftar Koin yang Diinvestasikan */}
        {expanded && (
          <div className="border-t border-stone-800 bg-stone-950/50 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Koin Tersimpan ({portfolio.assets.length})
              </span>
              <span className="text-[11px] text-stone-500">Harga Real-time</span>
            </div>

            {!hasAssets ? (
              <p className="py-3 text-center text-xs text-stone-500">
                Tidak ada aset koin aktif di akun Indodax Anda.
              </p>
            ) : (
              <div className="space-y-2">
                {portfolio.assets.map((asset) => {
                  const gradient = getCoinGradient(asset.code)
                  return (
                    <div
                      key={asset.code}
                      className="group rounded-xl bg-stone-900/90 p-3 transition-colors hover:bg-stone-850 ring-1 ring-white/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Avatar & Identitas Koin */}
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-bold text-xs shadow-sm ${gradient}`}
                          >
                            {asset.code.toUpperCase().slice(0, 4)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-sm text-white">
                                {asset.name}
                              </p>
                              <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] font-medium text-stone-400 uppercase">
                                {asset.code}
                              </span>
                            </div>
                            <p className="text-xs text-stone-400 tabular-nums">
                              {formatCryptoAmount(asset.amount, asset.code)}
                            </p>
                          </div>
                        </div>

                        {/* Nilai Total & Harga Pasar */}
                        <div className="text-right">
                          <p className="font-bold text-sm text-white tabular-nums">
                            {formatIDR(asset.idrValue, hideAmounts)}
                          </p>
                          <p className="text-[11px] text-stone-400 tabular-nums">
                            @{formatIDR(asset.price, hideAmounts)}
                          </p>
                        </div>
                      </div>

                      {/* Baris Status Profit/Loss */}
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-stone-800/60 pt-2 text-[11px]">
                        {/* 24 Jam PnL Badge */}
                        <div className="flex items-center gap-1">
                          <span className="text-stone-500">24 Jam:</span>
                          <span
                            className={`inline-flex items-center font-semibold ${
                              asset.isProfit24h ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {asset.isProfit24h ? '+' : ''}
                            {formatPercent(asset.change24h, false)}
                          </span>
                          <span className="text-stone-500">
                            ({formatIDR(asset.pnl24hIdr, hideAmounts)})
                          </span>
                        </div>

                        {/* Modal Beli / Overall PnL */}
                        <div className="flex items-center gap-1.5">
                          {asset.buyPrice && asset.buyPrice > 0 ? (
                            <div className="flex items-center gap-1">
                              <span
                                className={`rounded px-1.5 py-0.5 font-semibold text-[10px] ${
                                  asset.isProfitAllTime
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {asset.isProfitAllTime ? 'Untung' : 'Rugi'}{' '}
                                {formatPercent(asset.pnlAllTimePercent ?? 0)}
                              </span>
                              <button
                                onClick={() =>
                                  openEditModal(
                                    asset.code,
                                    asset.name,
                                    asset.price,
                                    asset.amount,
                                    asset.buyPrice,
                                  )
                                }
                                title="Ubah modal beli"
                                className="text-stone-400 hover:text-stone-200"
                              >
                                <Edit3 size={11} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                openEditModal(
                                  asset.code,
                                  asset.name,
                                  asset.price,
                                  asset.amount,
                                  asset.buyPrice,
                                )
                              }
                              className="rounded-lg bg-stone-800 px-2 py-0.5 text-[10px] font-medium text-teal-400 hover:bg-stone-700"
                            >
                              + Atur Modal
                            </button>
                          )}
                          <span className="rounded-full bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-400">
                            {asset.percentage}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Modal / Dialog Pengaturan Modal Beli */}
      {editingCoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-stone-800 bg-stone-900 p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`flex size-7 items-center justify-center rounded-lg bg-gradient-to-br text-[10px] font-bold ${getCoinGradient(
                    editingCoin.code,
                  )}`}
                >
                  {editingCoin.code.toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-sm">{editingCoin.name}</h3>
                  <p className="text-[11px] text-stone-400">
                    Atur Modal Beli (Harga Rata-Rata)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingCoin(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-800 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 pt-2">
              <div className="rounded-xl bg-stone-800/60 p-2.5 text-xs text-stone-300">
                <div className="flex justify-between">
                  <span className="text-stone-400">Jumlah dimiliki:</span>
                  <span className="font-semibold text-white">
                    {formatCryptoAmount(editingCoin.amount, editingCoin.code)}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-stone-400">Harga pasar saat ini:</span>
                  <span className="font-semibold text-emerald-400">
                    {formatIDR(editingCoin.currentPrice)}
                  </span>
                </div>
              </div>

              {/* Mode input: per koin atau total modal */}
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-800 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setInputMode('perUnit')}
                  className={`rounded-lg py-1.5 font-medium transition-all ${
                    inputMode === 'perUnit'
                      ? 'bg-teal-600 text-white shadow'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  Harga Beli / Koin
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('total')}
                  className={`rounded-lg py-1.5 font-medium transition-all ${
                    inputMode === 'total'
                      ? 'bg-teal-600 text-white shadow'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  Total Modal Rupiah
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs text-stone-300">
                  {inputMode === 'perUnit'
                    ? 'Harga beli rata-rata per koin (Rp):'
                    : 'Total modal yang dikeluarkan (Rp):'}
                </label>
                <input
                  type="number"
                  step="any"
                  value={modalInput}
                  onChange={(e) => setModalInput(e.target.value)}
                  placeholder={
                    inputMode === 'perUnit'
                      ? `Contoh: ${editingCoin.currentPrice}`
                      : 'Contoh: 5000000'
                  }
                  className="w-full rounded-xl border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white placeholder-stone-500 focus:border-teal-500 focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Simulasi Profit Real-time jika input valid */}
              {(() => {
                const val =
                  Number.parseFloat(modalInput.replace(/[^0-9.]/g, '')) || 0
                if (val > 0) {
                  const perUnit =
                    inputMode === 'total' && editingCoin.amount > 0
                      ? val / editingCoin.amount
                      : val
                  const pnlIdr = Math.round(
                    (editingCoin.currentPrice - perUnit) * editingCoin.amount,
                  )
                  const pnlPercent =
                    ((editingCoin.currentPrice - perUnit) / perUnit) * 100
                  const isProf = pnlIdr >= 0
                  return (
                    <div
                      className={`rounded-xl p-2.5 text-xs ${
                        isProf
                          ? 'bg-emerald-950/60 text-emerald-300 ring-1 ring-emerald-500/30'
                          : 'bg-rose-950/60 text-rose-300 ring-1 ring-rose-500/30'
                      }`}
                    >
                      <p className="font-semibold">
                        Simulasi:{' '}
                        {isProf ? 'Untung (Profit)' : 'Rugi (Loss)'}
                      </p>
                      <p className="mt-0.5 tabular-nums">
                        {isProf ? '+' : ''}
                        {formatIDR(pnlIdr)} ({formatPercent(pnlPercent)})
                      </p>
                    </div>
                  )
                }
                return null
              })()}

              <div className="flex gap-2 pt-2">
                {editingCoin.buyPrice > 0 && (
                  <button
                    type="button"
                    onClick={handleRemoveModal}
                    className="flex items-center justify-center rounded-xl bg-rose-900/50 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-900"
                  >
                    Hapus
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveModal}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-600 py-2.5 text-xs font-semibold text-white hover:bg-teal-500 shadow-lg shadow-teal-900/40"
                >
                  <Check size={14} /> Simpan Modal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
