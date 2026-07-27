import { format } from 'date-fns'
import { db, getSetting, setSetting } from '../db'
import { toDateStr } from './dates'

export const DEFAULT_REMINDER_TIME = '21:00'

/**
 * Reminder harian (PRD 6.9): "Sudah catat transaksi hari ini?" pada jam
 * pilihan pengguna. Cerdas sederhana — tidak mengganggu jika hari ini sudah
 * ada catatan. Berjalan saat aplikasi terbuka; di iOS butuh PWA ter-install.
 */
export async function checkReminder(): Promise<void> {
  if (!('Notification' in window)) return
  const enabled = await getSetting<boolean>('reminderEnabled')
  if (!enabled || Notification.permission !== 'granted') return

  const time = (await getSetting<string>('reminderTime')) ?? DEFAULT_REMINDER_TIME
  const now = new Date()
  if (format(now, 'HH:mm') < time) return

  const today = toDateStr(now)
  if ((await getSetting<string>('lastReminderDate')) === today) return

  // Sudah mencatat hari ini → tandai selesai tanpa mengirim apa pun
  const recorded = await db.transactions.where('date').equals(today).count()
  if (recorded > 0) {
    await setSetting('lastReminderDate', today)
    return
  }

  const title = 'Aliranku'
  const options: NotificationOptions = {
    body: 'Sudah catat transaksi hari ini? Cuma butuh 5 detik, kok. ✍️',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'aliranku-daily-reminder',
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(title, options)
    else new Notification(title, options)
    await setSetting('lastReminderDate', today)
  } catch {
    // Notifikasi gagal (mis. izin dicabut) — biarkan, coba lagi lain kali
  }
}
