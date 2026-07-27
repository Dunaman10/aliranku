import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-4 shadow-sm dark:bg-stone-900 ${className}`}
    >
      {children}
    </div>
  )
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-md max-h-[94dvh] overflow-y-auto rounded-t-3xl bg-stone-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-stone-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-2 text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; activeClass?: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-xl bg-stone-200 p-1 dark:bg-stone-800">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
            value === o.value
              ? (o.activeClass ??
                'bg-white text-stone-900 shadow-sm dark:bg-stone-600 dark:text-white')
              : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
      {text}
    </div>
  )
}
