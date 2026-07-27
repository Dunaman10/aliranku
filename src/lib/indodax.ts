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
  amount: number
  idrValue: number
}

export interface Portfolio {
  totalIdr: number
  idr: number
  assets: PortfolioAsset[]
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

export async function fetchPortfolio(
  apiKey: string,
  secret: string,
): Promise<Portfolio> {
  const body = `method=getInfo&timestamp=${Date.now()}&recvWindow=60000`
  const proxies = [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ]

  let res: Response | null = null

  // 1. Coba local dev proxy jika di lingkungan development
  if (import.meta.env.DEV) {
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
      // Abaikan jika dev proxy gagal
    }
  }

  // 2. Jika bukan dev atau dev proxy gagal, coba CORS proxies secara berurutan
  if (!res) {
    for (const makeProxyUrl of proxies) {
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
        // Abaikan jika proxy ini gagal, coba proxy berikutnya
      }
    }
  }

  if (!res || !res.ok) {
    throw new CorsBlockedError()
  }

  const json = await res.json()
  if (json.success !== 1) {
    throw new Error(json.error ?? 'Indodax menolak permintaan — cek API key.')
  }
  const balance: Record<string, string> = json.return?.balance ?? {}
  const hold: Record<string, string> = json.return?.balance_hold ?? {}
  const amounts = new Map<string, number>()
  for (const src of [balance, hold]) {
    for (const [code, v] of Object.entries(src)) {
      const n = Number.parseFloat(v)
      if (Number.isFinite(n) && n > 0)
        amounts.set(code, (amounts.get(code) ?? 0) + n)
    }
  }
  const idr = amounts.get('idr') ?? 0
  amounts.delete('idr')

  // Harga pasar untuk konversi ke IDR
  let tickers: Record<string, { last: string }> = {}
  if (amounts.size > 0) {
    let tRes: Response | null = null
    if (import.meta.env.DEV) {
      try {
        tRes = await fetch('/indodax-api/tickers')
      } catch {
        // pass
      }
    }
    if (!tRes || !tRes.ok) {
      for (const makeProxyUrl of proxies) {
        try {
          tRes = await fetch(makeProxyUrl('https://indodax.com/api/tickers'))
          if (tRes.ok) break
        } catch {
          // pass
        }
      }
    }
    if (tRes && tRes.ok) {
      try {
        tickers = (await tRes.json()).tickers ?? {}
      } catch {
        // pass
      }
    }
  }
  const assets: PortfolioAsset[] = []
  for (const [code, amount] of amounts) {
    const last = Number.parseFloat(tickers[`${code}_idr`]?.last ?? '')
    if (Number.isFinite(last))
      assets.push({ code, amount, idrValue: Math.round(amount * last) })
  }
  const totalIdr = Math.round(idr + assets.reduce((s, a) => s + a.idrValue, 0))
  return { totalIdr, idr: Math.round(idr), assets }
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
