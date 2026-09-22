import { db, getSetting, setSetting } from '../db'

/**
 * Integrasi Indodax (PRD 6.14, eksplorasi): API privat per akun dengan
 * API key read-only milik pengguna sendiri. Request ditandatangani
 * HMAC-SHA512. Catatan realistis: TAPI Indodax didesain server-side —
 * browser sering memblokirnya lewat CORS; kalau begitu, aplikasi menawarkan
 * pembaruan saldo manual sebagai gantinya.
 */

export interface PortfolioAsset {
  code: string
  name: string
  amount: number
  price: number
  idrValue: number
  percentage: number
  price24h: number
  change24h: number
  pnl24hIdr: number
  isProfit24h: boolean
  buyPrice?: number
  pnlAllTimeIdr?: number
  pnlAllTimePercent?: number
  isProfitAllTime?: boolean
}

export interface Portfolio {
  totalIdr: number
  idr: number
  cryptoIdr: number
  assets: PortfolioAsset[]
  pnl24hIdr: number
  pnl24hPercent: number
  isProfit24h: boolean
  totalCostIdr?: number
  pnlAllTimeIdr?: number
  pnlAllTimePercent?: number
  isProfitAllTime?: boolean
  lastUpdated: number
}

export interface RawBalances {
  idr: number
  crypto: Record<string, number>
}

export interface IndodaxSummaries {
  tickers: Record<
    string,
    {
      last: string
      high: string
      low: string
      buy: string
      sell: string
      name?: string
      vol_idr?: string
      server_time?: number
    }
  >
  prices_24h: Record<string, string>
  prices_7d?: Record<string, string>
}

/** Error koneksi yang kemungkinan besar disebabkan blokir CORS browser. */
export class CorsBlockedError extends Error {
  constructor() {
    super('Browser memblokir koneksi langsung ke Indodax (CORS).')
  }
}

async function hmacSha512Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  )
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]

/** Mengambil ringkasan pasar lengkap (harga live, 24h change, nama koin) dari Indodax Public API */
export async function fetchSummaries(): Promise<IndodaxSummaries> {
  let res: Response | null = null

  // 1. Coba relative path (Vite dev proxy, Netlify rewrite, Vercel rewrite)
  try {
    res = await fetch('/indodax-api/summaries')
  } catch {
    // fallback
  }

  // 2. Fallback ke CORS proxies publik
  if (!res || !res.ok) {
    for (const makeProxyUrl of CORS_PROXIES) {
      try {
        res = await fetch(makeProxyUrl('https://indodax.com/api/summaries'))
        if (res.ok) break
      } catch {
        // coba proxy berikutnya
      }
    }
  }

  if (!res || !res.ok) {
    throw new Error('Gagal memuat data harga pasar Indodax.')
  }

  const data = await res.json()
  return {
    tickers: data.tickers ?? {},
    prices_24h: data.prices_24h ?? {},
    prices_7d: data.prices_7d ?? {},
  }
}

/** Hitung ulang nilai portofolio & profit/loss berdasarkan saldo koin dan data harga pasar */
export function calculatePortfolio(
  raw: RawBalances,
  summaries: IndodaxSummaries,
  buyPrices: Record<string, number> = {},
): Portfolio {
  const { tickers, prices_24h } = summaries
  const usdtIdr = Number.parseFloat(tickers['usdt_idr']?.last ?? '16000') || 16000

  const assets: PortfolioAsset[] = []
  let totalCryptoIdr = 0
  let totalPnl24hIdr = 0
  let totalCrypto24hAgo = 0
  let totalCostIdr = 0
  let hasAnyCost = false

  for (const [code, amount] of Object.entries(raw.crypto)) {
    if (amount <= 0) continue

    const lowerCode = code.toLowerCase()
    const pairIdr = `${lowerCode}_idr`
    const pairUsdt = `${lowerCode}_usdt`
    const ticker = tickers[pairIdr] || tickers[pairUsdt]

    let price = 0
    let price24h = 0
    const name = ticker?.name || lowerCode.toUpperCase()

    if (tickers[pairIdr]) {
      price = Number.parseFloat(tickers[pairIdr].last || '0')
      const p24 =
        prices_24h[pairIdr] ||
        prices_24h[`${lowerCode}idr`] ||
        tickers[pairIdr].last
      price24h = Number.parseFloat(p24 || '0')
    } else if (tickers[pairUsdt]) {
      const priceInUsdt = Number.parseFloat(tickers[pairUsdt].last || '0')
      price = priceInUsdt * usdtIdr
      const p24Usdt =
        prices_24h[pairUsdt] ||
        prices_24h[`${lowerCode}usdt`] ||
        tickers[pairUsdt].last
      price24h = Number.parseFloat(p24Usdt || '0') * usdtIdr
    }

    if (!Number.isFinite(price) || price <= 0) continue
    if (!Number.isFinite(price24h) || price24h <= 0) price24h = price

    const idrValue = Math.round(amount * price)
    totalCryptoIdr += idrValue

    const change24h =
      price24h > 0 ? ((price - price24h) / price24h) * 100 : 0
    const pnl24hIdr = Math.round((price - price24h) * amount)
    totalPnl24hIdr += pnl24hIdr
    totalCrypto24hAgo += Math.round(amount * price24h)

    // Modal / All-time PnL
    const buyPrice = buyPrices[lowerCode]
    let pnlAllTimeIdr: number | undefined
    let pnlAllTimePercent: number | undefined
    let isProfitAllTime: boolean | undefined

    if (buyPrice && buyPrice > 0) {
      hasAnyCost = true
      totalCostIdr += Math.round(amount * buyPrice)
      pnlAllTimeIdr = Math.round((price - buyPrice) * amount)
      pnlAllTimePercent = ((price - buyPrice) / buyPrice) * 100
      isProfitAllTime = pnlAllTimeIdr >= 0
    }

    assets.push({
      code: lowerCode,
      name,
      amount,
      price,
      idrValue,
      percentage: 0, // dihitung setelah loop
      price24h,
      change24h,
      pnl24hIdr,
      isProfit24h: change24h >= 0,
      buyPrice,
      pnlAllTimeIdr,
      pnlAllTimePercent,
      isProfitAllTime,
    })
  }

  // Hitung persentase porsi setiap aset
  for (const a of assets) {
    a.percentage =
      totalCryptoIdr > 0 ? Math.round((a.idrValue / totalCryptoIdr) * 1000) / 10 : 0
  }

  // Urutkan aset dari nilai IDR terbesar
  assets.sort((a, b) => b.idrValue - a.idrValue)

  const idr = Math.round(raw.idr)
  const totalIdr = Math.round(idr + totalCryptoIdr)
  const pnl24hPercent =
    totalCrypto24hAgo > 0 ? (totalPnl24hIdr / totalCrypto24hAgo) * 100 : 0

  let allTimePnlIdr: number | undefined
  let allTimePnlPercent: number | undefined
  let isProfitAllTime: boolean | undefined

  if (hasAnyCost && totalCostIdr > 0) {
    allTimePnlIdr = totalCryptoIdr - totalCostIdr
    allTimePnlPercent = (allTimePnlIdr / totalCostIdr) * 100
    isProfitAllTime = allTimePnlIdr >= 0
  }

  return {
    totalIdr,
    idr,
    cryptoIdr: totalCryptoIdr,
    assets,
    pnl24hIdr: totalPnl24hIdr,
    pnl24hPercent,
    isProfit24h: totalPnl24hIdr >= 0,
    totalCostIdr: hasAnyCost ? totalCostIdr : undefined,
    pnlAllTimeIdr: allTimePnlIdr,
    pnlAllTimePercent: allTimePnlPercent,
    isProfitAllTime,
    lastUpdated: Date.now(),
  }
}

/** Mengambil saldo akun koin dari Indodax TAPI (getInfo) */
export async function fetchRawBalances(
  apiKey: string,
  secret: string,
): Promise<RawBalances> {
  const body = `method=getInfo&timestamp=${Date.now()}&recvWindow=60000`

  let res: Response | null = null

  // 1. Coba proxy relative path
  try {
    res = await fetch('/indodax-tapi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Key: apiKey,
        Sign: await hmacSha512Hex(body, secret),
      },
      body,
    })
  } catch {
    // Abaikan jika gagal
  }

  // 2. Coba CORS proxy publik
  if (!res || !res.ok) {
    for (const makeProxyUrl of CORS_PROXIES) {
      try {
        const proxyUrl = makeProxyUrl('https://indodax.com/tapi')
        res = await fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Key: apiKey,
            Sign: await hmacSha512Hex(body, secret),
          },
          body,
        })
        if (res.ok) break
      } catch {
        // coba berikutnya
      }
    }
  }

  if (!res || !res.ok) {
    throw new CorsBlockedError()
  }

  const json = await res.json()
  if (json.success !== 1) {
    const err = json.error ?? 'Indodax menolak permintaan.'
    if (err.toLowerCase().includes('invalid credentials')) {
      throw new Error(
        'Kredensial ditolak (API Key/Secret salah, belum aktif, atau Proxy menghapus header). Pastikan Anda mengisi Secret Key secara manual jika scan QR, cek akurasi jam HP Anda, dan pastikan aplikasi ini di-deploy di Vercel/Netlify (bukan Github Pages).',
      )
    }
    throw new Error(err)
  }

  const balance: Record<string, string> = json.return?.balance ?? {}
  const hold: Record<string, string> = json.return?.balance_hold ?? {}
  const cryptoMap: Record<string, number> = {}

  for (const src of [balance, hold]) {
    for (const [code, v] of Object.entries(src)) {
      const n = Number.parseFloat(v)
      if (Number.isFinite(n) && n > 0) {
        cryptoMap[code.toLowerCase()] = (cryptoMap[code.toLowerCase()] ?? 0) + n
      }
    }
  }

  const idr = cryptoMap['idr'] ?? 0
  delete cryptoMap['idr']

  return { idr, crypto: cryptoMap }
}

/** Mengambil portofolio lengkap dengan saldo terbaru dan harga pasar terkini */
export async function fetchPortfolio(
  apiKey: string,
  secret: string,
): Promise<Portfolio> {
  const [raw, summaries, buyPrices] = await Promise.all([
    fetchRawBalances(apiKey, secret),
    fetchSummaries(),
    loadBuyPrices(),
  ])

  // Simpan raw balances terbaru ke setting untuk perhitungan cepat
  await setSetting('indodaxRawBalances', raw)

  return calculatePortfolio(raw, summaries, buyPrices)
}

/** Coba ambil riwayat transaksi beli dari TAPI untuk estimasi harga beli rata-rata */
export async function fetchCoinTradeHistory(
  apiKey: string,
  secret: string,
  pair: string,
): Promise<number | null> {
  try {
    const body = `method=tradeHistory&pair=${pair}&timestamp=${Date.now()}&recvWindow=60000`
    let res: Response | null = null

    try {
      res = await fetch('/indodax-tapi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Key: apiKey,
          Sign: await hmacSha512Hex(body, secret),
        },
        body,
      })
    } catch {
      // ignore
    }

    if (!res || !res.ok) {
      for (const makeProxyUrl of CORS_PROXIES) {
        try {
          res = await fetch(makeProxyUrl('https://indodax.com/tapi'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Key: apiKey,
              Sign: await hmacSha512Hex(body, secret),
            },
            body,
          })
          if (res.ok) break
        } catch {
          // ignore
        }
      }
    }

    if (!res || !res.ok) return null
    const json = await res.json()
    if (json.success !== 1 || !json.return?.trades) return null

    const trades: Array<{ type: string; price: string; amount: string }> =
      json.return.trades
    const buys = trades.filter((t) => t.type === 'buy')
    if (buys.length === 0) return null

    let totalSpent = 0
    let totalBought = 0
    for (const b of buys) {
      const p = Number.parseFloat(b.price)
      const a = Number.parseFloat(b.amount)
      if (Number.isFinite(p) && Number.isFinite(a) && a > 0) {
        totalSpent += p * a
        totalBought += a
      }
    }

    return totalBought > 0 ? Math.round(totalSpent / totalBought) : null
  } catch {
    return null
  }
}

/** Mengambil harga beli / modal koin yang tersimpan di IndexedDB */
export async function loadBuyPrices(): Promise<Record<string, number>> {
  return (await getSetting<Record<string, number>>('indodaxBuyPrices')) ?? {}
}

/** Menyimpan harga beli / modal koin rata-rata */
export async function saveBuyPrice(code: string, price: number): Promise<void> {
  const current = await loadBuyPrices()
  const key = code.toLowerCase()
  if (price <= 0) {
    delete current[key]
  } else {
    current[key] = price
  }
  await setSetting('indodaxBuyPrices', current)
}


/* ---------- Penyimpanan kredensial terenkripsi (AES-GCM, kunci non-extractable) ---------- */

async function deviceKey(): Promise<CryptoKey> {
  const existing = await getSetting<CryptoKey>('deviceKey')
  if (existing) return existing
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  await setSetting('deviceKey', key)
  return key
}

export interface IndodaxCreds {
  apiKey: string
  secret: string
}

export async function saveCreds(creds: IndodaxCreds): Promise<void> {
  const key = await deviceKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(creds)),
  )
  await setSetting('indodaxCipher', { iv, data: new Uint8Array(data) })
}

export async function loadCreds(): Promise<IndodaxCreds | null> {
  const cipher = await getSetting<{ iv: Uint8Array; data: Uint8Array }>(
    'indodaxCipher',
  )
  if (!cipher) return null
  try {
    const key = await deviceKey()
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: cipher.iv },
      key,
      cipher.data,
    )
    return JSON.parse(new TextDecoder().decode(plain))
  } catch {
    return null
  }
}

export async function clearCreds(): Promise<void> {
  await db.settings.delete('indodaxCipher')
  await db.settings.delete('indodaxAccountId')
  await db.settings.delete('indodaxLastSync')
  await db.settings.delete('indodaxRawBalances')
  await db.settings.delete('indodaxPortfolio')
}


/**
 * Set saldo akun investasi agar sama dengan nilai portofolio: saldo akun =
 * saldoAwal + mutasi transaksi, jadi saldoAwal disetel ke (nilai − mutasi).
 */
export async function syncAccountBalance(
  accountId: number,
  portfolioIdr: number,
): Promise<void> {
  const txs = await db.transactions.toArray()
  let net = 0
  for (const t of txs) {
    if (t.accountId === accountId) {
      if (t.type === 'income') net += t.amount
      else if (t.type === 'expense') net -= t.amount
      else net -= t.amount
    }
    if (t.toAccountId === accountId && t.type === 'transfer') net += t.amount
  }
  await db.accounts.update(accountId, { initialBalance: portfolioIdr - net })
  await setSetting('indodaxLastSync', Date.now())
}
