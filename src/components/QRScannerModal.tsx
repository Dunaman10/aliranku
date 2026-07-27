import { useEffect, useRef } from 'react'
import jsQR from 'jsqr'
import { QrCode, X } from 'lucide-react'

interface QRScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScan: (data: string) => void
}

export function QRScannerModal({ isOpen, onClose, onScan }: QRScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!isOpen) return

    let isScanning = true

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.setAttribute('playsinline', 'true') // iOS requirement
          videoRef.current.play()
          animFrameRef.current = requestAnimationFrame(scanTick)
        }
      } catch (err) {
        console.error('Kamera gagal diakses:', err)
      }
    }

    function scanTick() {
      if (!isScanning) return
      const video = videoRef.current
      const canvas = canvasRef.current

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight
        canvas.width = video.videoWidth
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          })
          if (code && code.data) {
            isScanning = false
            onScan(code.data)
            onClose()
            return
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(scanTick)
    }

    startCamera()

    return () => {
      isScanning = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [isOpen, onClose, onScan])

  if (!isOpen) return null

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current || document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, img.width, img.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        if (code && code.data) {
          onScan(code.data)
          onClose()
        } else {
          alert('QR code tidak terdeteksi dari gambar ini.')
        }
      }
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-stone-900 text-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-800 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-sm">
            <QrCode size={18} className="text-teal-400" /> Scan QR Code Indodax
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative aspect-square bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanner Overlay Frame */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-56 w-56 rounded-2xl border-2 border-dashed border-teal-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
          </div>
        </div>

        <div className="p-4 space-y-2 text-center">
          <p className="text-xs text-stone-400">
            Arahkan kamera ke QR code di Indodax, atau pilih gambar dari galeri:
          </p>
          <label className="inline-block cursor-pointer rounded-xl bg-stone-800 px-4 py-2 text-xs font-medium hover:bg-stone-700">
            Unggah Gambar QR
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
