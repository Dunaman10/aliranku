// Membuat ikon PWA Aliranku (PNG) tanpa dependency eksternal:
// latar gradien teal + tiga gelombang putih ("aliran").
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

/* ---------- PNG encoder minimal ---------- */
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------- Gambar ikon ---------- */
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
// gradien teal: atas #14b8a6 → bawah #0f766e
const TOP = [0x14, 0xb8, 0xa6]
const BOT = [0x0f, 0x76, 0x6e]

function drawIcon(size, { rounded }) {
  const buf = Buffer.alloc(size * size * 4)
  const r = rounded ? size * 0.22 : 0
  const waveAmp = size * 0.05
  const waveThick = size * 0.045
  const aa = Math.max(1, size / 256)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // jarak keluar dari rounded-rect (untuk alpha tepi)
      let alpha = 1
      if (rounded) {
        const cx = Math.max(r - x, x - (size - 1 - r), 0)
        const cy = Math.max(r - y, y - (size - 1 - r), 0)
        const d = Math.hypot(cx, cy)
        alpha = 1 - smooth(r - aa, r + aa, d)
      }
      if (alpha <= 0) continue

      const t = y / size
      let [rr, gg, bb] = [
        lerp(TOP[0], BOT[0], t),
        lerp(TOP[1], BOT[1], t),
        lerp(TOP[2], BOT[2], t),
      ]

      // tiga gelombang putih
      let wave = 0
      for (let k = 0; k < 3; k++) {
        const cyk =
          size * (0.34 + 0.16 * k) +
          waveAmp * Math.sin((x / size) * Math.PI * 2.2 + k * 1.1)
        const d = Math.abs(y - cyk)
        wave = Math.max(wave, 1 - smooth(waveThick - aa, waveThick + aa, d))
      }
      if (wave > 0) {
        const w = wave * (0.92 - 0.08 * 0) // putih lembut
        rr = lerp(rr, 255, w)
        gg = lerp(gg, 255, w)
        bb = lerp(bb, 255, w)
      }

      const i = (y * size + x) * 4
      buf[i] = Math.round(rr)
      buf[i + 1] = Math.round(gg)
      buf[i + 2] = Math.round(bb)
      buf[i + 3] = Math.round(alpha * 255)
    }
  }
  return encodePNG(size, size, buf)
}

writeFileSync(join(outDir, 'icon-192.png'), drawIcon(192, { rounded: true }))
writeFileSync(join(outDir, 'icon-512.png'), drawIcon(512, { rounded: true }))
writeFileSync(join(outDir, 'maskable-512.png'), drawIcon(512, { rounded: false }))
writeFileSync(
  join(outDir, 'apple-touch-icon.png'),
  drawIcon(180, { rounded: false }),
)
console.log('Ikon dibuat di public/icons')
