import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell,
  Download,
  FileSpreadsheet,
  Fingerprint,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { useRef, useState } from 'react'
import {
  ACCOUNT_TYPES,
  CatIcon,
  catColor,
  COLOR_SLUGS,
  ICONS,
} from '../components/meta'
import ImportSheet from '../components/ImportSheet'
import IndodaxSection from '../components/IndodaxSection'
import RecurringSection from '../components/RecurringSection'
import { Card, Segmented, Sheet } from '../components/ui'
import {
  db,
  setSetting,
  type Account,
  type AccountType,
  type Category,
  type CategoryNature,
} from '../db'
import { isBiometricSupported, registerBiometric } from '../lib/bio'
import { computeBalances } from '../lib/balances'
import { transactionsToCSV } from '../lib/csv'
import { formatIDR, formatNumber } from '../lib/money'
import { DEFAULT_REMINDER_TIME } from '../lib/notify'
import { hashPin, verifyPin } from '../lib/pin'
import { useUI, type Theme } from '../store'

/* ---------- Form Akun ---------- */

function AccountForm({
  account,
  onClose,
}: {
  account?: Account
  onClose: () => void
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank')
  const [balance, setBalance] = useState(account?.initialBalance ?? 0)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) return setError('Nama akun tidak boleh kosong.')
    if (account) {
      await db.accounts.update(account.id, {
        name: name.trim(),
        type,
        initialBalance: balance,
      })
    } else {
      await db.accounts.add({
        name: name.trim(),
        type,
        initialBalance: balance,
        createdAt: Date.now(),
      } as Account)
    }
    onClose()
  }

  return (
    <Sheet title={account ? 'Edit Akun' : 'Tambah Akun'} onClose={onClose}>
      <div className="space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama akun (mis. Bank Jago, GoPay)"
          className="w-full rounded-xl bg-white px-3 py-2.5 text-sm dark:bg-stone-800"
        />
        <div>
          <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
            Jenis akun
          </p>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((t) => {
              const Icon = ACCOUNT_TYPES[t].icon
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-1 rounded-xl p-2 text-[11px] ${
                    type === t
                      ? 'bg-teal-600/15 ring-2 ring-teal-600'
                      : 'bg-white dark:bg-stone-800'
                  }`}
                >
                  <Icon size={18} />
                  {ACCOUNT_TYPES[t].label}
                </button>
              )
            })}
          </div>
          {type === 'investasi' && (
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
              Saldo akun investasi ditampilkan terpisah dan tidak memengaruhi
              skor kesehatan.
            </p>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
            Saldo awal
          </p>
          <input
            inputMode="numeric"
            value={balance === 0 ? '' : formatNumber(balance)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              setBalance(digits ? Math.min(Number(digits), 999_999_999_999) : 0)
            }}
            placeholder="0"
            className="w-full rounded-xl bg-white px-3 py-2.5 text-sm tabular-nums dark:bg-stone-800"
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          onClick={save}
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white active:bg-teal-700"
        >
          Simpan
        </button>
      </div>
    </Sheet>
  )
}

/* ---------- Form Kategori ---------- */

function CategoryForm({
  category,
  onClose,
}: {
  category?: Category
  onClose: () => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<'income' | 'expense'>(
    category?.type ?? 'expense',
  )
  const [nature, setNature] = useState<CategoryNature>(category?.nature ?? null)
  const [icon, setIcon] = useState(category?.icon ?? 'circle-dashed')
  const [color, setColor] = useState(category?.color ?? 'blue')
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) return setError('Nama kategori tidak boleh kosong.')
    const data = {
      name: name.trim(),
      type,
      nature: type === 'expense' ? nature : null,
      icon,
      color,
    }
    if (category) await db.categories.update(category.id, data)
    else await db.categories.add(data as Category)
    onClose()
  }

  return (
    <Sheet
      title={category ? 'Edit Kategori' : 'Tambah Kategori'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama kategori"
          className="w-full rounded-xl bg-white px-3 py-2.5 text-sm dark:bg-stone-800"
        />
        {!category && (
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: 'expense', label: 'Pengeluaran' },
              { value: 'income', label: 'Pemasukan' },
            ]}
          />
        )}
        {type === 'expense' && (
          <div>
            <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
              Sifat (untuk analisis 50/30/20)
            </p>
            <Segmented
              value={nature ?? 'none'}
              onChange={(v) => setNature(v === 'none' ? null : (v as 'need' | 'want'))}
              options={[
                { value: 'need', label: 'Kebutuhan' },
                { value: 'want', label: 'Keinginan' },
                { value: 'none', label: 'Netral' },
              ]}
            />
          </div>
        )}
        <div>
          <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
            Warna
          </p>
          <div className="flex flex-wrap gap-2">
            {COLOR_SLUGS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Warna ${c}`}
                className={`size-8 rounded-full ${
                  color === c ? 'ring-2 ring-stone-900 ring-offset-2 dark:ring-white dark:ring-offset-stone-900' : ''
                }`}
                style={{ backgroundColor: catColor(c) }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
            Ikon
          </p>
          <div className="grid grid-cols-7 gap-2">
            {Object.entries(ICONS).map(([slug, Icon]) => (
              <button
                key={slug}
                onClick={() => setIcon(slug)}
                aria-label={`Ikon ${slug}`}
                className={`flex items-center justify-center rounded-xl p-2 ${
                  icon === slug
                    ? 'bg-teal-600/15 ring-2 ring-teal-600'
                    : 'bg-white dark:bg-stone-800'
                }`}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          onClick={save}
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white active:bg-teal-700"
        >
          Simpan
        </button>
      </div>
    </Sheet>
  )
}

/* ---------- Form PIN ---------- */

function PinForm({
  currentHash,
  onClose,
}: {
  currentHash?: string
  onClose: () => void
}) {
  const [oldPin, setOldPin] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const { showToast } = useUI()

  const field =
    'w-full rounded-xl bg-white px-3 py-2.5 text-sm tracking-widest dark:bg-stone-800'
  const clean = (v: string) => v.replace(/\D/g, '').slice(0, 6)

  async function save() {
    if (currentHash && !(await verifyPin(oldPin, currentHash)))
      return setError('PIN lama salah.')
    if (pin.length < 4) return setError('PIN minimal 4 digit.')
    if (pin !== confirmPin) return setError('Konfirmasi PIN tidak sama.')
    await setSetting('pinHash', await hashPin(pin))
    showToast('PIN aktif. Aplikasi akan terkunci saat dibuka.')
    onClose()
  }

  async function disable() {
    if (currentHash && !(await verifyPin(oldPin, currentHash)))
      return setError('PIN lama salah.')
    await db.settings.delete('pinHash')
    showToast('Kunci PIN dimatikan.')
    onClose()
  }

  return (
    <Sheet title={currentHash ? 'Ubah Kunci PIN' : 'Aktifkan Kunci PIN'} onClose={onClose}>
      <div className="space-y-3">
        {currentHash && (
          <input
            type="password"
            inputMode="numeric"
            value={oldPin}
            onChange={(e) => setOldPin(clean(e.target.value))}
            placeholder="PIN lama"
            className={field}
          />
        )}
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(clean(e.target.value))}
          placeholder="PIN baru (4–6 digit)"
          className={field}
        />
        <input
          type="password"
          inputMode="numeric"
          value={confirmPin}
          onChange={(e) => setConfirmPin(clean(e.target.value))}
          placeholder="Ulangi PIN baru"
          className={field}
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          onClick={save}
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white active:bg-teal-700"
        >
          Simpan
        </button>
        {currentHash && (
          <button
            onClick={disable}
            className="w-full rounded-xl bg-rose-100 py-2.5 text-sm font-semibold text-rose-600 dark:bg-rose-950 dark:text-rose-400"
          >
            Matikan kunci PIN
          </button>
        )}
      </div>
    </Sheet>
  )
}

/* ---------- Halaman Pengaturan ---------- */

export default function Settings() {
  const { theme, setTheme, showToast } = useUI()
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const txs = useLiveQuery(() => db.transactions.toArray(), [])
  const settings = useLiveQuery(() => db.settings.toArray(), [])
  const [accountSheet, setAccountSheet] = useState<
    { open: true; account?: Account } | { open: false }
  >({ open: false })
  const [catSheet, setCatSheet] = useState<
    { open: true; category?: Category } | { open: false }
  >({ open: false })
  const [pinSheet, setPinSheet] = useState(false)
  const [importSheet, setImportSheet] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!accounts || !categories || !txs || !settings) return null
  const balances = computeBalances(accounts, txs)
  const settingMap = new Map(settings.map((s) => [s.key, s.value]))
  const reminderEnabled = settingMap.get('reminderEnabled') === true
  const reminderTime =
    (settingMap.get('reminderTime') as string) ?? DEFAULT_REMINDER_TIME
  const pinHash = settingMap.get('pinHash') as string | undefined

  async function toggleReminder(on: boolean) {
    if (on) {
      if (!('Notification' in window)) {
        alert('Browser ini tidak mendukung notifikasi.')
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        alert('Izin notifikasi ditolak — reminder tidak bisa aktif.')
        return
      }
    }
    await setSetting('reminderEnabled', on)
    if (on) showToast(`Reminder aktif tiap ${reminderTime.replace(':', '.')} WIB.`)
  }

  async function removeAccount(a: Account) {
    const used = await db.transactions
      .where('accountId')
      .equals(a.id)
      .count()
    const usedTo = await db.transactions.where('toAccountId').equals(a.id).count()
    if (used + usedTo > 0) {
      alert(
        `Akun "${a.name}" masih dipakai ${used + usedTo} transaksi. Hapus/pindahkan transaksinya dulu.`,
      )
      return
    }
    if (confirm(`Hapus akun "${a.name}"?`)) await db.accounts.delete(a.id)
  }

  async function removeCategory(c: Category) {
    const used = await db.transactions.where('categoryId').equals(c.id).count()
    if (used > 0) {
      alert(
        `Kategori "${c.name}" masih dipakai ${used} transaksi. Ubah kategorinya dulu.`,
      )
      return
    }
    if (confirm(`Hapus kategori "${c.name}"?`)) await db.categories.delete(c.id)
  }

  async function exportData() {
    const payload = {
      app: 'aliranku',
      version: 2,
      exportedAt: new Date().toISOString(),
      accounts: await db.accounts.toArray(),
      categories: await db.categories.toArray(),
      transactions: await db.transactions.toArray(),
      budgets: await db.budgets.toArray(),
      recurring: await db.recurring.toArray(),
      goals: await db.goals.toArray(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `aliranku-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function exportCSV() {
    const csv = transactionsToCSV(
      txs!,
      new Map(categories!.map((c) => [c.id, c])),
      new Map(accounts!.map((a) => [a.id, a])),
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `aliranku-transaksi-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importData(file: File) {
    try {
      const parsed = JSON.parse(await file.text())
      if (
        parsed?.app !== 'aliranku' ||
        !Array.isArray(parsed.accounts) ||
        !Array.isArray(parsed.categories) ||
        !Array.isArray(parsed.transactions)
      ) {
        alert('File tidak dikenali sebagai backup Aliranku.')
        return
      }
      if (
        !confirm(
          'Impor akan MENGGANTI seluruh data saat ini dengan isi backup. Lanjutkan?',
        )
      )
        return
      await db.transaction(
        'rw',
        [db.accounts, db.categories, db.transactions, db.budgets, db.recurring, db.goals],
        async () => {
          await Promise.all([
            db.accounts.clear(),
            db.categories.clear(),
            db.transactions.clear(),
            db.budgets.clear(),
            db.recurring.clear(),
            db.goals.clear(),
          ])
          await db.accounts.bulkAdd(parsed.accounts)
          await db.categories.bulkAdd(parsed.categories)
          await db.transactions.bulkAdd(parsed.transactions)
          if (Array.isArray(parsed.budgets)) await db.budgets.bulkAdd(parsed.budgets)
          if (Array.isArray(parsed.recurring)) await db.recurring.bulkAdd(parsed.recurring)
          if (Array.isArray(parsed.goals)) await db.goals.bulkAdd(parsed.goals)
        },
      )
      alert('Backup berhasil diimpor.')
    } catch {
      alert('Gagal membaca file backup.')
    }
  }

  const sectionTitle = 'mb-2 text-sm font-semibold'

  return (
    <div className="space-y-5 p-4">
      <h1 className="pt-2 text-xl font-bold">Pengaturan</h1>

      {/* Akun */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Akun / Dompet</h2>
          <button
            onClick={() => setAccountSheet({ open: true })}
            className="flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400"
          >
            <Plus size={14} /> Tambah
          </button>
        </div>
        <Card className="!p-2">
          {accounts.map((a) => {
            const Icon = ACCOUNT_TYPES[a.type].icon
            return (
              <div key={a.id} className="flex items-center gap-3 px-2 py-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-teal-600/10 text-teal-700 dark:text-teal-400">
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {a.name}
                  </span>
                  <span className="block text-xs text-stone-500 dark:text-stone-400">
                    {ACCOUNT_TYPES[a.type].label} ·{' '}
                    {formatIDR(balances.get(a.id) ?? 0)}
                  </span>
                </span>
                <button
                  onClick={() => setAccountSheet({ open: true, account: a })}
                  aria-label={`Edit ${a.name}`}
                  className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => removeAccount(a)}
                  aria-label={`Hapus ${a.name}`}
                  className="p-1.5 text-stone-400 hover:text-rose-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </Card>
      </section>

      {/* Kategori */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Kategori</h2>
          <button
            onClick={() => setCatSheet({ open: true })}
            className="flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400"
          >
            <Plus size={14} /> Tambah
          </button>
        </div>
        {(['expense', 'income'] as const).map((t) => (
          <div key={t} className="mb-3">
            <p className="mb-1 text-xs text-stone-500 dark:text-stone-400">
              {t === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
            </p>
            <Card className="!p-2">
              {categories
                .filter((c) => c.type === t)
                .map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-2 py-1.5">
                    <CatIcon category={c} size={15} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.name}</span>
                      {c.type === 'expense' && (
                        <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                          {c.nature === 'need'
                            ? 'Kebutuhan'
                            : c.nature === 'want'
                              ? 'Keinginan'
                              : 'Netral'}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => setCatSheet({ open: true, category: c })}
                      aria-label={`Edit ${c.name}`}
                      className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => removeCategory(c)}
                      aria-label={`Hapus ${c.name}`}
                      className="p-1.5 text-stone-400 hover:text-rose-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
            </Card>
          </div>
        ))}
      </section>

      {/* Transaksi rutin (PRD 6.8) */}
      <RecurringSection />

      {/* Reminder harian (PRD 6.9) */}
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Bell size={14} /> Reminder Harian
        </h2>
        <Card className="space-y-3 !p-3">
          <label className="flex items-center justify-between text-sm">
            <span>Ingatkan mencatat tiap hari</span>
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(e) => toggleReminder(e.target.checked)}
              className="size-4 accent-teal-600"
            />
          </label>
          {reminderEnabled && (
            <label className="flex items-center justify-between text-sm">
              <span>Jam reminder</span>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) =>
                  e.target.value && setSetting('reminderTime', e.target.value)
                }
                className="rounded-xl bg-stone-100 px-3 py-1.5 text-sm dark:bg-stone-800"
              />
            </label>
          )}
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Tidak mengganggu jika hari itu kamu sudah mencatat. Di iPhone,
            install dulu Aliranku ke home screen agar notifikasi berfungsi
            (iOS 16.4+).
          </p>
        </Card>
      </section>

      {/* Keamanan */}
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Lock size={14} /> Keamanan
        </h2>
        <Card className="divide-y divide-stone-100 !p-3 dark:divide-stone-800">
          <button
            onClick={() => setPinSheet(true)}
            className="flex w-full items-center justify-between py-1 text-sm"
          >
            <span>Kunci PIN saat membuka aplikasi</span>
            <span
              className={`text-xs font-semibold ${
                pinHash
                  ? 'text-teal-700 dark:text-teal-400'
                  : 'text-stone-400'
              }`}
            >
              {pinHash ? 'Aktif' : 'Nonaktif'}
            </span>
          </button>
          {pinHash && isBiometricSupported() && (
            <div className="flex w-full items-center justify-between pt-2 text-sm">
              <span className="flex items-center gap-1.5">
                <Fingerprint size={16} className="text-teal-600 dark:text-teal-400" />
                Masuk dengan Sidik Jari / Biometrik
              </span>
              <input
                type="checkbox"
                checked={settingMap.get('bioEnabled') === true}
                onChange={async (e) => {
                  const checked = e.target.checked
                  if (checked) {
                    const ok = await registerBiometric()
                    if (ok) {
                      await setSetting('bioEnabled', true)
                      showToast('Sidik jari / Biometrik berhasil diaktifkan')
                    } else {
                      showToast('Gagal mendaftarkan biometrik')
                    }
                  } else {
                    await setSetting('bioEnabled', false)
                    showToast('Sidik jari / Biometrik dinonaktifkan')
                  }
                }}
                className="size-4 accent-teal-600"
              />
            </div>
          )}
          {pinHash && (
            <div className="pt-2">
              <button
                onClick={() => {
                  sessionStorage.removeItem('aliranku-unlocked')
                  window.location.reload()
                }}
                className="w-full rounded-xl bg-stone-100 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
              >
                Kunci Aplikasi Sekarang
              </button>
            </div>
          )}
        </Card>
      </section>

      {/* Tampilan */}
      <section>
        <h2 className={sectionTitle}>Tampilan</h2>
        <Segmented
          value={theme}
          onChange={(t) => setTheme(t as Theme)}
          options={[
            { value: 'system', label: 'Sistem' },
            { value: 'light', label: 'Terang' },
            { value: 'dark', label: 'Gelap' },
          ]}
        />
      </section>

      {/* Impor e-statement (PRD 6.13) */}
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <FileSpreadsheet size={14} /> Impor e-Statement Bank
        </h2>
        <Card className="space-y-2 !p-3">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Unggah CSV mutasi dari aplikasi bankmu — 5 menit sebulan
            menggantikan puluhan input manual. Ada layar review, deteksi
            duplikat, dan kategori otomatis yang belajar dari koreksimu.
          </p>
          <button
            onClick={() => setImportSheet(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white"
          >
            <Upload size={16} /> Impor CSV mutasi
          </button>
        </Card>
      </section>

      {/* Integrasi Indodax (PRD 6.14) */}
      <IndodaxSection />

      {/* Data */}
      <section>
        <h2 className={sectionTitle}>Data & Backup</h2>
        <Card className="space-y-2 !p-3">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Data tersimpan hanya di perangkat ini. Rutin export sebagai backup,
            ya — data bisa hilang jika penyimpanan browser dibersihkan.
          </p>
          <div className="flex gap-2">
            <button
              onClick={exportData}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white"
            >
              <Download size={16} /> Backup
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-stone-200 py-2.5 text-sm font-semibold dark:bg-stone-800"
            >
              <Upload size={16} /> Import
            </button>
            <button
              onClick={exportCSV}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-stone-200 py-2.5 text-sm font-semibold dark:bg-stone-800"
            >
              <FileSpreadsheet size={16} /> CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importData(f)
                e.target.value = ''
              }}
            />
          </div>
        </Card>
      </section>

      <p className="pb-2 text-center text-xs text-stone-400 dark:text-stone-500">
        Aliranku v0.3.0 — local-first, 100% gratis
      </p>

      {accountSheet.open && (
        <AccountForm
          account={accountSheet.account}
          onClose={() => setAccountSheet({ open: false })}
        />
      )}
      {catSheet.open && (
        <CategoryForm
          category={catSheet.category}
          onClose={() => setCatSheet({ open: false })}
        />
      )}
      {pinSheet && (
        <PinForm currentHash={pinHash} onClose={() => setPinSheet(false)} />
      )}
      {importSheet && <ImportSheet onClose={() => setImportSheet(false)} />}
    </div>
  )
}
