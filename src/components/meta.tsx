import {
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Clapperboard,
  Coffee,
  CircleDashed,
  CreditCard,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Music,
  PawPrint,
  Plane,
  ReceiptText,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi,
  type LucideIcon,
} from 'lucide-react'
import type { AccountType, Category } from '../db'

export const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  bus: Bus,
  car: Car,
  fuel: Fuel,
  receipt: ReceiptText,
  wifi: Wifi,
  'shopping-bag': ShoppingBag,
  shirt: Shirt,
  clapperboard: Clapperboard,
  gamepad: Gamepad2,
  music: Music,
  'heart-pulse': HeartPulse,
  dumbbell: Dumbbell,
  'graduation-cap': GraduationCap,
  book: BookOpen,
  home: Home,
  plane: Plane,
  baby: Baby,
  paw: PawPrint,
  'credit-card': CreditCard,
  banknote: Banknote,
  sparkles: Sparkles,
  briefcase: Briefcase,
  gift: Gift,
  'circle-dashed': CircleDashed,
}

export const COLOR_SLUGS = [
  'blue',
  'orange',
  'aqua',
  'yellow',
  'magenta',
  'green',
  'violet',
  'red',
  'gray',
] as const

export function catColor(slug: string): string {
  return `var(--cat-${slug})`
}

export function CatIcon({
  category,
  size = 18,
}: {
  category?: Category
  size?: number
}) {
  const Icon = (category && ICONS[category.icon]) || CircleDashed
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-white"
      style={{ backgroundColor: catColor(category?.color ?? 'gray') }}
    >
      <Icon size={size} />
    </span>
  )
}

export const ACCOUNT_TYPES: Record<
  AccountType,
  { label: string; icon: LucideIcon }
> = {
  cash: { label: 'Cash (Fisik)', icon: Wallet },
  bank: { label: 'Bank (Cashless)', icon: Landmark },
  ewallet: { label: 'E-Wallet (Cashless)', icon: Smartphone },
  investasi: { label: 'Investasi', icon: TrendingUp },
}

/** Palet status (tetap — tidak ikut tema) untuk label skor. */
export const TONE_COLORS: Record<'green' | 'yellow' | 'orange' | 'red', string> = {
  green: '#0ca30c',
  yellow: '#fab219',
  orange: '#ec835a',
  red: '#d03b3b',
}
