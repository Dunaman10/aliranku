# Aliranku — Manajemen Keuangan Pribadi 💸

Aliranku adalah aplikasi **Progressive Web App (PWA)** pencatatan keuangan pribadi dengan arsitektur *local-first*. Artinya, seluruh data kamu disimpan dengan aman di dalam perangkatmu sendiri tanpa perlu koneksi internet, sangat cepat, dan menjaga privasi 100%.

> *"Catat transaksi dalam 5 detik, tahu kondisi keuanganmu dalam sekali lihat."*

## 🌟 Fitur Utama

- **100% Offline & Local-First**: Dibangun dengan IndexedDB (via Dexie.js), data kamu tetap berada di HP kamu. Tidak ada sinkronisasi diam-diam ke server.
- **PWA Ready**: Bisa di-install langsung ke HP (Android/iOS) atau Desktop layaknya aplikasi native tanpa *search bar* browser.
- **Dashboard & Laporan (Analytics)**: Visualisasi arus kas (cash flow) interaktif dan bersih menggunakan Recharts.
- **Manajemen Akun (Dompet)**: Pisahkan uangmu ke berbagai rekening (Tunai, Bank, E-Wallet, Investasi).
- **Kategorisasi Cerdas (Needs vs Wants)**: Menggunakan pola 50/30/20. Tiap kategori pengeluaran dipisah menjadi "Kebutuhan" atau "Keinginan".
- **Transaksi Berulang (Recurring)**: Catat otomatis transaksi yang berulang setiap bulannya pada tanggal jatuh tempo.
- **Transfer Antar Akun**: Pindahkan uang dari Bank ke E-Wallet tanpa merusak laporan pengeluaran.
- **Fitur Kunci Keamanan (PIN Lock)**: Lindungi privasi finansialmu menggunakan 6 digit PIN (di-hash menggunakan SHA-256).
- **Notifikasi/Reminder**: Pengingat harian untuk mencatat pengeluaran.
- **Dark Mode Support**: Tema Gelap, Terang, atau ikuti pengaturan sistem perangkatmu.

## 🛠️ Tech Stack

Aplikasi ini dibangun di atas teknologi web modern yang berfokus pada kecepatan dan ukuran bundle yang ringan:

- **Framework**: [React 18](https://react.dev/) + [Vite](https://vitejs.dev/) (TypeScript)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Database**: [Dexie.js](https://dexie.org/) (Wrapper IndexedDB)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Ikon**: [Lucide React](https://lucide.dev/)
- **Chart**: [Recharts](https://recharts.org/)
- **PWA**: [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)

---

## 🚀 Cara Instalasi & Menjalankan (Development)

Pastikan kamu sudah menginstal **Node.js** (versi 18 atau lebih baru).

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/username/aliranku.git
cd aliranku
npm install
```

### 2. Jalankan Mode Development
```bash
npm run dev
```
Aplikasi akan berjalan di `http://localhost:5173`. 

### 3. Build untuk Production
```bash
npm run build
```
Hasil build akan berada di dalam folder `dist/`, siap untuk diunggah ke Vercel, Netlify, atau layanan hosting statis lainnya.

### 4. Mengetes PWA di HP dari Localhost
Karena Chrome Android mewajibkan HTTPS (*Secure Context*) untuk instalasi PWA:
1. Jalankan `npm run dev -- --host`
2. Gunakan *tunneling* (misal: `npx localtunnel --port 5173`) untuk mendapatkan URL HTTPS gratis.
3. Buka URL HTTPS tersebut dari Chrome HP kamu, dan klik **Install app**.

---

## 📱 Cara Instalasi di HP (Pengguna Akhir)

1. Buka website Aliranku (setelah kamu mem-publish-nya ke Vercel/layanan hosting).
2. Di **Google Chrome (Android)**:
   - Tap menu titik tiga di pojok kanan atas.
   - Pilih **Install app** (atau **Instal aplikasi**).
3. Di **Safari (iOS)**:
   - Tap tombol "Share" (ikon panah ke atas) di menu bawah.
   - Pilih **Add to Home Screen**.
4. Aplikasi Aliranku siap digunakan sepenuhnya tanpa batas langsung dari *Home Screen* kamu!

---

## 🤝 Kontribusi & Modifikasi

Aplikasi ini bersifat sumber terbuka (Open Source). Jika kamu ingin bereksperimen dengan menambahkan sistem *backup data* berformat JSON, impor dari CSV, atau sinkronisasi ke Google Drive, silakan buat *Pull Request* atau *Fork* repositori ini. 

> *Arsitektur data schema (Account, Category, Tx, Budget, Recurring, Goal, Setting) dapat dilihat secara terpusat pada file `src/db.ts`.*
