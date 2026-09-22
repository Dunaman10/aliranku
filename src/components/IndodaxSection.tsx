import { useLiveQuery } from 'dexie-react-hooks'
import {
  Link2,
  QrCode,
  RefreshCw,
  Unlink,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'

import { useState } from 'react'
import { db, setSetting, type Account } from '../db'
import {
  CorsBlockedError,
  fetchPortfolio,
  loadCreds,
  saveCreds,
  syncAccountBalance,
} from '../lib/indodax'
import { formatCryptoAmount, formatIDR, formatPercent } from '../lib/money'
import { useIndodaxLive } from '../lib/useIndodaxLive'
import { useUI } from '../store'
import { Card } from './ui'
import { QRScannerModal } from './QRScannerModal'

/** Integrasi Indodax di Pengaturan (PRD 6.14 — eksplorasi). */
export default function IndodaxSection() {
  const { showToast, hideAmounts } = useUI()
  const {
    connected,
    isLive,
    loading: liveLoading,
    portfolio,
    lastSync,
    refreshNow,
    disconnect: liveDisconnect,
    setConnectedManual,
  } = useIndodaxLive()

  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? []
  const [apiKey, setApiKey] = useState('')
  const [secret, setSecret] = useState('')
  const [targetId, setTargetId] = useState<number | 'new'>('new')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [showQRScanner, setShowQRScanner] = useState(false)

  const investAccounts = accounts.filter((a) => a.type === 'investasi')

  async function resolveTargetAccount(): Promise<number> {
    if (targetId !== 'new') return targetId
    const saved = await db.settings.get('indodaxAccountId')
    if (saved && accounts.some((a) => a.id === saved.value))
      return saved.value as number
    const existing = accounts.find((a) => a.name.toLowerCase() === 'indodax')
    if (existing) return existing.id
    return (await db.accounts.add({
      name: 'Indodax',
      type: 'investasi',
      initialBalance: 0,
      createdAt: Date.now(),
    } as Account)) as number
  }

  function handleQRScan(data: string) {
    try {
      let parsedKey = ''
      let parsedSecret = ''

      if (data.startsWith('{')) {
        const json = JSON.parse(data)
        parsedKey = json.apiKey || json.api_key || json.key || ''
        parsedSecret = json.secretKey || json.secret_key || json.secret || ''
      } else if (data.includes('|') || data.includes(':') || data.includes(',')) {
        const parts = data.split(/[|:,]/)
        if (parts.length >= 2) {
          parsedKey = parts[0].trim()
          parsedSecret = parts[1].trim()
        }
      } else {
        parsedKey = data.trim()
      }

      if (parsedKey) setApiKey(parsedKey)
      if (parsedSecret) setSecret(parsedSecret)

      showToast(
        parsedKey && parsedSecret
          ? 'Berhasil membaca API Key & Secret Key dari QR!'
          : 'Berhasil membaca QR Code!',
      )
    } catch {
      showToast('Gagal membaca format QR Code.')
    }
  }

  async function connectAndSync(creds?: { apiKey: string; secret: string }) {
    setBusy(true)
    setMessage('')
    try {
      const c = creds ?? (await loadCreds())
      if (!c) throw new Error('Isi API key & secret dulu, ya.')
      const p = await fetchPortfolio(c.apiKey, c.secret)
      const accId = await resolveTargetAccount()
      await saveCreds(c)
      await setSetting('indodaxAccountId', accId)
      await syncAccountBalance(accId, p.totalIdr)
      setConnectedManual(true)
      setApiKey('')
      setSecret('')
      showToast(
        `Portofolio Indodax tersinkron: ${formatIDR(p.totalIdr)}.`,
      )
    } catch (e) {
      if (e instanceof CorsBlockedError) {
        setMessage(
          'Browser memblokir koneksi langsung ke Indodax (CORS) — memang keterbatasan integrasi tanpa server. Untuk sekarang, perbarui saldo akun investasimu manual lewat Edit Akun (ubah saldo awal).',
        )
      } else {
        setMessage(e instanceof Error ? e.message : 'Gagal terhubung.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!confirm('Putuskan koneksi Indodax? Kredensial terenkripsi akan dihapus.'))
      return
    await liveDisconnect()
    setMessage('')
    showToast('Koneksi Indodax diputus.')
  }

  if (connected === null) return null

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Link2 size={14} /> Integrasi Indodax
      </h2>
      <Card className="space-y-3 !p-3">
        {connected ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Terhubung ✅</p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  {isLive ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                      Live (update otomatis tiap 15 dtk)
                    </span>
                  ) : (
                    'Sinkronisasi terjadwal'
                  )}
                  {lastSync && (
                    <span>
                      {' '}
                      · {new Date(lastSync).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  )}
                </p>
              </div>
              {portfolio && (
                <span
                  className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${
                    portfolio.isProfit24h
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                  }`}
                >
                  {portfolio.isProfit24h ? (
                    <ArrowUpRight size={12} />
                  ) : (
                    <ArrowDownRight size={12} />
                  )}
                  {formatPercent(portfolio.pnl24hPercent)}
                </span>
              )}
            </div>

            {/* Cuplikan Portofolio Singkat */}
            {portfolio && (
              <div className="rounded-xl bg-stone-100 p-2.5 dark:bg-stone-800/60 text-xs space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-stone-500 dark:text-stone-400">
                    Total Nilai:
                  </span>
                  <span className="font-bold text-stone-900 dark:text-white tabular-nums">
                    {formatIDR(portfolio.totalIdr, hideAmounts)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-stone-500 dark:text-stone-400">
                    Kas IDR / Kripto:
                  </span>
                  <span className="tabular-nums">
                    {formatIDR(portfolio.idr, hideAmounts)} /{' '}
                    {formatIDR(portfolio.cryptoIdr, hideAmounts)}
                  </span>
                </div>

                {portfolio.assets.length > 0 && (
                  <div className="pt-1 border-t border-stone-200 dark:border-stone-700/60 space-y-1">
                    <p className="text-[10px] font-semibold uppercase text-stone-500">
                      Aset Koin ({portfolio.assets.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {portfolio.assets.map((a) => (
                        <span
                          key={a.code}
                          className="inline-flex items-center gap-1 rounded-md bg-stone-200/70 px-2 py-0.5 text-[11px] font-medium dark:bg-stone-700"
                        >
                          <span className="uppercase font-bold text-teal-600 dark:text-teal-400">
                            {a.code}
                          </span>
                          <span className="tabular-nums">
                            {formatCryptoAmount(a.amount)}
                          </span>
                          <span
                            className={`text-[10px] font-semibold ${
                              a.isProfit24h
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {formatPercent(a.change24h)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => refreshNow()}
                disabled={busy || liveLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={busy || liveLoading ? 'animate-spin' : ''}
                />
                Perbarui sekarang
              </button>
              <button
                onClick={disconnect}
                className="flex items-center justify-center gap-2 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-semibold text-rose-600 dark:bg-rose-950 dark:text-rose-400"
              >
                <Unlink size={15} /> Putus
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">

              <p className="text-xs text-stone-500 dark:text-stone-400">
                Tampilkan nilai portofolio kripto sebagai saldo akun investasi.
                Buat API key <b>read-only</b> (izin lihat saja) di Indodax.
              </p>
              <button
                type="button"
                onClick={() => setShowQRScanner(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300"
              >
                <QrCode size={14} /> Scan QR
              </button>
            </div>

            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value.trim())}
              placeholder="API Key"
              className="w-full rounded-xl bg-stone-100 px-3 py-2.5 text-sm dark:bg-stone-800"
            />
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value.trim())}
              placeholder="Secret Key"
              className="w-full rounded-xl bg-stone-100 px-3 py-2.5 text-sm dark:bg-stone-800"
            />
            <label className="flex items-center gap-3 text-sm">
              <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
                Saldo masuk ke
              </span>
              <select
                value={targetId}
                onChange={(e) =>
                  setTargetId(
                    e.target.value === 'new' ? 'new' : Number(e.target.value),
                  )
                }
                className="min-w-0 flex-1 rounded-xl bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800"
              >
                <option value="new">Akun baru "Indodax"</option>
                {investAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                apiKey && secret
                  ? connectAndSync({ apiKey, secret })
                  : setMessage('Isi API key & secret dulu, ya.')
              }
              disabled={busy}
              className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Menghubungkan…' : 'Hubungkan & sinkron'}
            </button>
          </>
        )}
        {message && (
          <p className="text-xs text-amber-700 dark:text-amber-400">{message}</p>
        )}
      </Card>

      <QRScannerModal
        isOpen={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScan={handleQRScan}
      />
    </section>
  )
}

