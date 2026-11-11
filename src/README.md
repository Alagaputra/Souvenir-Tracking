# Souvenir Tracking

**SOUV** adalah aplikasi pencatatan stok dan distribusi souvenir untuk tim funding. Antarmuka berbahasa Indonesia tersedia untuk desktop dan HP, dengan hak akses admin dan anggota.

## Fitur

- Daftar souvenir, foto produk, stok minimum, dan arsip produk.
- Pencatatan barang masuk, pemberian kepada nasabah, penyesuaian, dan pembatalan transaksi.
- Label QR produk dan pemindaian kamera pada tampilan HP.
- Riwayat dengan pencarian dan filter; anggota melihat riwayat miliknya sendiri.
- Ekspor riwayat dan register stok per barang ke Excel.
- Pengelolaan akun dan sesi login oleh admin.

## Teknologi

Next.js 16, React 19, TypeScript, Tailwind CSS 4, dan PostgreSQL. Ekspor Excel dibuat di browser menggunakan JSZip. Pengujian memakai Node.js Test Runner dan Playwright.

Backend saat ini mengakses **PostgreSQL lokal melalui executable `psql`** dan hanya menerima host database loopback. Hosting aplikasi memerlukan proses Node.js serta PostgreSQL lokal; konfigurasi ini belum ditujukan untuk database cloud atau hosting statis.

## Mulai menjalankan

Prasyarat: Node.js 22 atau lebih baru, npm, serta PostgreSQL dengan `psql`, `initdb`, `pg_ctl`, dan `createdb` untuk setup database otomatis. Konfigurasi bawaan mengarah ke PostgreSQL 18 di Windows.

Jalankan perintah dari folder repo. Pada Windows PowerShell yang memblokir `npm.ps1`, gunakan `npm.cmd` sebagai pengganti `npm`.

### Pratinjau tanpa database

```sh
npm install
npm run preview:demo
```

Buka `http://localhost:3000`. Pratinjau menggunakan data contoh dan tidak menyimpan perubahan. Decoder QR pada server pratinjau dapat tidak tersedia; gunakan aplikasi Next.js untuk pemindaian lengkap.

### Aplikasi dengan database lokal

1. Salin `src/.env.example` menjadi `src/.env.local` dari direktori utama repo.
2. Sesuaikan `POSTGRES_BIN` dengan folder `bin` instalasi PostgreSQL.
3. Jalankan:

   ```sh
   npm run db:setup
   npm run db:check
   npm run dev
   ```

4. Buka `http://localhost:3000`. Akun awal dan password hasil setup tersimpan di `src/.env.local`; password tidak dicetak ke terminal.

Jika `DATABASE_URL` kosong, setup membuat cluster khusus repo pada `127.0.0.1:55432`, database `souvenir_tracking`, serta akun dan stok contoh. Jika memakai database lokal yang sudah ada, isi URL database khusus aplikasi sebelum setup. Jangan arahkan setup ke database aplikasi lain.

Setup dapat dijalankan ulang untuk menyalakan cluster proyek dan menerapkan migrasi yang belum terpasang. Berkas migrasi yang sudah diterapkan tidak boleh diubah karena setup memeriksa checksum. Data PostgreSQL dan log lokal disimpan dalam `.local/`.

### Build produksi

```sh
npm run build
npm start
```

Database harus tetap berjalan. Kamera HP memerlukan HTTPS atau localhost dan izin kamera. Untuk akses melalui tunnel HTTPS, isi `APP_PUBLIC_ORIGIN` dengan origin HTTPS aktif tanpa path, lalu mulai ulang server. Perintah `dev` dan `start` mendengarkan pada semua antarmuka jaringan; server alternatif `npm run local` hanya mendengarkan pada loopback.

## Konfigurasi

| Variabel | Kegunaan |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL lokal; dibuat otomatis jika kosong saat setup. |
| `POSTGRES_BIN` | Folder executable PostgreSQL; akses database juga dapat memakai `psql` dari `PATH`. |
| `APP_PUBLIC_ORIGIN` | Origin HTTPS untuk akses publik melalui tunnel; kosongkan untuk localhost. |
| `LOCAL_ADMIN_PASSWORD` | Password bootstrap admin; dibuat otomatis jika kosong. |
| `LOCAL_MEMBER_PASSWORD` | Password bootstrap anggota; dibuat otomatis jika kosong. |

Email akun bootstrap adalah `admin@funding.local` dan `anggota@funding.local`. Nilai email disimpan setup pada `src/.env.local`. Mengubah password di berkas environment setelah akun dibuat tidak mengganti password akun yang sudah ada.

## Perintah yang tersedia

| Perintah | Kegunaan |
| --- | --- |
| `npm run dev` | Server pengembangan Next.js. |
| `npm run build` / `npm start` | Build dan server produksi Next.js. |
| `npm run preview:demo` | Pratinjau data contoh tanpa database. |
| `npm run local` | Server Node alternatif dengan API PostgreSQL lokal. |
| `npm run db:setup` / `npm run db:start` | Setup, migrasi, dan startup database lokal. |
| `npm run db:check` | Periksa koneksi dan schema database. |
| `npm run typecheck` | Pemeriksaan TypeScript. |
| `npm test` | Unit test tanpa database. |
| `npm run test:db` | Tes integrasi pada database di `src/.env.local`. |
| `npm run test:e2e` | Tes browser desktop dan HP dengan fixture API. |

Untuk tes browser, instal Chromium terlebih dahulu dengan `npx playwright install chromium`. Tes integrasi membuat dan membersihkan fixture; gunakan database pengujian terpisah dari data operasional. Pastikan port 3000 tersedia sebelum menjalankan tes browser.

## Struktur aplikasi dalam `src/`

```text
app/          Halaman Next.js, API routes, dan stylesheet
components/   Antarmuka workspace, scanner, dan komponen UI
lib/          Aturan domain, API, database, keamanan, dan ekspor
db/migrations/ Migrasi SQL berurutan
public/fonts/ Font lokal beserta lisensinya
scripts/      Setup database dan server alternatif
tests/        Unit test, integrasi database, dan tes browser
```

Konfigurasi Next.js, TypeScript, Playwright, dan PostCSS berada di `src/`. `package.json` pada direktori utama menyediakan pintasan agar semua perintah di atas tetap dapat dijalankan dari root repo. Untuk perubahan SQL, tambahkan migrasi baru; jangan mengubah berkas migrasi yang sudah diterapkan.

## Berkas lokal

Folder `arsip-lokal/` pada direktori utama menampung dokumentasi internal, backup, impor/ekspor, cache npm, pratinjau, hasil tes browser, dan cache TypeScript. Seluruh isinya diabaikan Git. Runtime PostgreSQL yang sudah ada tetap disimpan di `.local/postgres/` agar cluster aktif tidak perlu dipindahkan.

Konfigurasi lokal berada di `src/.env.local`; templat yang dibagikan adalah `src/.env.example`. Dependensi di `node_modules/`, hasil build Next.js, dan konfigurasi lokal juga diabaikan Git. Saat menerbitkan repo, gunakan berkas yang dilacak Git; jangan unggah folder kerja secara keseluruhan lewat browser karena berkas yang diabaikan Git dapat ikut terpilih.

