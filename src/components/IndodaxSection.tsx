import { useLiveQuery } from 'dexie-react-hooks'
import { Link2, QrCode, RefreshCw, Unlink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { db, getSetting, setSetting, type Account } from '../db'
import {
  clearCreds,
  CorsBlockedError,
  fetchPortfolio,
  loadCreds,
  saveCreds,
  syncAccountBalance,
} from '../lib/indodax'
import { formatIDR } from '../lib/money'
import { useUI } from '../store'
import { Card } from './ui'
import { QRScannerModal } from './QRScannerModal'

/** Integrasi Indodax di Pengaturan (PRD 6.14 — eksplorasi). */
export default function IndodaxSection() {
  const { showToast } = useUI()
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? []
  const [connected, setConnected] = useState<boolean | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [secret, setSecret] = useState('')
  const [targetId, setTargetId] = useState<number | 'new'>('new')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<number | undefined>()
  const [showQRScanner, setShowQRScanner] = useState(false)

  useEffect(() => {
    loadCreds().then((c) => setConnected(!!c))
    getSetting<number>('indodaxLastSync').then(setLastSync)
  }, [])

  const investAccounts = accounts.filter((a) => a.type === 'investasi')

  async function resolveTargetAccount(): Promise<number> {
    if (targetId !== 'new') return targetId
    const saved = await getSetting<number>('indodaxAccountId')
    if (saved != null && accounts.some((a) => a.id === saved)) return saved
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
      // 1. Coba parse JSON jika format QR Indodax berupa JSON
      let parsedKey = ''
      let parsedSecret = ''

      if (data.startsWith('{')) {
        const json = JSON.parse(data)
        parsedKey = json.apiKey || json.api_key || json.key || ''
        parsedSecret = json.secretKey || json.secret_key || json.secret || ''
      } else if (data.includes('|') || data.includes(':') || data.includes(',')) {
        // 2. Coba separator populer
        const parts = data.split(/[|:,]/)
        if (parts.length >= 2) {
          parsedKey = parts[0].trim()
          parsedSecret = parts[1].trim()
        }
      } else {
        // 3. Jika berupa string tunggal (misal API key saja)
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
      const portfolio = await fetchPortfolio(c.apiKey, c.secret)
      const accId = await resolveTargetAccount()
      await saveCreds(c)
      await setSetting('indodaxAccountId', accId)
      await syncAccountBalance(accId, portfolio.totalIdr)
      setConnected(true)
      setLastSync(Date.now())
      setApiKey('')
      setSecret('')
      showToast(
        `Portofolio Indodax tersinkron: ${formatIDR(portfolio.totalIdr)}.`,
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
    await clearCreds()
    setConnected(false)
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
            <p className="text-sm">
              Terhubung ✅
              {lastSync && (
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  {' '}
                  · sinkron terakhir {new Date(lastSync).toLocaleString('id-ID')}
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => connectAndSync()}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
                Perbarui saldo
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

