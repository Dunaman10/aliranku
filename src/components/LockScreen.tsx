import { Delete, Fingerprint, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { verifyPin } from '../lib/pin'
import { isBiometricSupported, verifyBiometric } from '../lib/bio'

/** Layar kunci PIN & Biometrik saat membuka aplikasi. */
export default function LockScreen({
  pinHash,
  onUnlock,
  bioEnabled = false,
}: {
  pinHash: string
  onUnlock: () => void
  bioEnabled?: boolean
}) {
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)
  const [canBio, setCanBio] = useState(false)

  useEffect(() => {
    if (bioEnabled && isBiometricSupported()) {
      setCanBio(true)
      // Auto trigger biometrik saat pertama kali layar kunci terbuka
      handleBio()
    }
  }, [bioEnabled])

  const handleBio = async () => {
    const ok = await verifyBiometric()
    if (ok) onUnlock()
  }

  useEffect(() => {
    if (pin.length < 4) return
    let cancelled = false
    verifyPin(pin, pinHash).then((ok) => {
      if (cancelled) return
      if (ok) onUnlock()
      else if (pin.length >= 6) {
        setWrong(true)
        setPin('')
      }
    })
    return () => {
      cancelled = true
    }
  }, [pin, pinHash, onUnlock])

  const btn =
    'rounded-2xl bg-white py-4 text-2xl font-semibold shadow-sm active:bg-stone-200 dark:bg-stone-800 dark:active:bg-stone-700'

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-stone-100 p-6 dark:bg-stone-950">
      <div className="flex flex-col items-center gap-2">
        <span className="flex size-14 items-center justify-center rounded-full bg-teal-600 text-white">
          <Lock size={24} />
        </span>
        <h1 className="text-lg font-bold">Aliranku terkunci</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {wrong ? 'PIN salah — coba lagi, ya.' : 'Masukkan PIN atau Sidik Jari'}
        </p>
      </div>
      <div className="flex gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={`size-3.5 rounded-full ${
              i < pin.length
                ? 'bg-teal-600'
                : 'bg-stone-300 dark:bg-stone-700'
            }`}
          />
        ))}
      </div>
      <div className="grid w-full max-w-64 grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            className={btn}
            onClick={() => {
              setWrong(false)
              setPin((p) => (p.length < 6 ? p + d : p))
            }}
          >
            {d}
          </button>
        ))}
        {canBio ? (
          <button
            className={`${btn} flex items-center justify-center text-teal-600 dark:text-teal-400`}
            onClick={handleBio}
            aria-label="Masuk dengan Sidik Jari"
          >
            <Fingerprint size={28} />
          </button>
        ) : (
          <span />
        )}
        <button
          className={btn}
          onClick={() => {
            setWrong(false)
            setPin((p) => (p.length < 6 ? `${p}0` : p))
          }}
        >
          0
        </button>
        <button
          className={`${btn} flex items-center justify-center text-stone-500`}
          onClick={() => setPin((p) => p.slice(0, -1))}
          aria-label="Hapus"
        >
          <Delete size={22} />
        </button>
      </div>
    </div>
  )
}
