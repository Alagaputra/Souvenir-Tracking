# Panduan pengembangan SOUV

Panduan ini menjelaskan pembagian kode, konfigurasi, API, dan pengujian. Untuk gambaran fitur serta instalasi awal, baca [README utama](../README.md).

**Semua perintah dalam panduan ini dijalankan dari direktori utama repo.** `package.json` di root meneruskan perintah ke aplikasi dalam `src/`; frontend dan backend Next.js berjalan melalui `npm run dev` yang sama.

## Peta kode

### Frontend

| Lokasi | Fungsi |
| --- | --- |
| [app/page.tsx](app/page.tsx) | Titik masuk halaman workspace. |
| [app/layout.tsx](app/layout.tsx) | Layout utama, metadata, dan bahasa halaman. |
| [components/workspace.tsx](components/workspace.tsx) | Navigasi, dashboard, form, pengelolaan produk/anggota, dan riwayat. |
| [components/quick-scan.tsx](components/quick-scan.tsx) | Panel pemindaian dan transaksi pada HP. |
| [components/live-scanner.tsx](components/live-scanner.tsx) | Akses kamera serta pembacaan QR. |
| [components/ui/](components/ui/) | Komponen UI yang digunakan bersama. |
| [app/globals.css](app/globals.css), [app/theme.css](app/theme.css) | Stylesheet aplikasi dan tema. |

### Backend

| Lokasi | Fungsi |
| --- | --- |
| [app/api/](app/api/) | Route handlers Next.js; meneruskan permintaan ke handler API bersama. |
| [lib/local-api.mjs](lib/local-api.mjs) | Autentikasi, pemeriksaan peran, validasi, dan operasi workspace. |
| [lib/local-db.mjs](lib/local-db.mjs) | Konfigurasi koneksi dan eksekusi SQL melalui proses `psql`. |
| [lib/local-security.mjs](lib/local-security.mjs) | Hash password, token sesi, dan cookie. |
| [lib/public-origin.mjs](lib/public-origin.mjs) | Validasi dan penyusunan URL untuk server lokal alternatif. |
| [db/migrations/](db/migrations/) | Schema, constraint, penguncian transaksi, dan fungsi SQL. |

Otorisasi diperiksa di backend dan fungsi database. Pembatasan tombol atau menu di frontend hanya mengatur tampilan.

### Modul bersama dan ekspor

| Lokasi | Fungsi |
| --- | --- |
| [lib/domain.mjs](lib/domain.mjs) | Validasi nilai, format QR, dan aturan tanggal. |
| [lib/types.ts](lib/types.ts) | Tipe profil, produk, transaksi, dan snapshot. |
| [lib/history-xlsx.mjs](lib/history-xlsx.mjs) | Pembuatan Excel riwayat di browser. |
| [lib/register-xlsx.mjs](lib/register-xlsx.mjs) | Rekonsiliasi data dan pembuatan register Excel di browser. |
| [lib/demo.ts](lib/demo.ts) | Data contoh untuk pratinjau. |

## API

API berada pada origin yang sama dengan frontend. Route handlers memakai runtime Node.js.

| Metode | Endpoint | Kegunaan |
| --- | --- | --- |
| `POST` | `/api/auth` | Login dan pembuatan sesi. |
| `DELETE` | `/api/auth` | Logout dan pencabutan sesi. |
| `GET` | `/api/workspace` | Snapshot produk, riwayat, dan akun sesuai hak akses. |
| `POST` | `/api/workspace` | Pencatatan stok serta pengelolaan produk. |
| `POST` | `/api/members` | Pembuatan dan perubahan status akun oleh admin. |
| `POST` | `/api/upload` | Unggah foto produk oleh admin. |
| `GET` | `/api/photos/:id` | Membaca foto untuk pengguna yang terautentikasi. |
| `GET` | `/api/register` | Snapshot lengkap produk dan transaksi untuk register admin. |

`/api/register` mengembalikan data JSON. Berkas `.xlsx` dirangkai di browser oleh modul ekspor. Permintaan yang mengubah data memerlukan header `Origin` yang sesuai; operasi terautentikasi memakai cookie sesi.

## Konfigurasi environment

Templat konfigurasi tersedia di [.env.example](.env.example). Nilai lokal dibaca dari `src/.env.local` dan tidak disertakan Git.

| Variabel | Penggunaan |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL pada `localhost`, `127.0.0.1`, atau `::1`. Jika kosong saat setup, cluster proyek dibuat otomatis. |
| `POSTGRES_BIN` | Folder executable PostgreSQL. Setup membutuhkan `initdb`, `pg_ctl`, dan `createdb`; koneksi aplikasi memakai `psql`. |
| `APP_PUBLIC_ORIGIN` | Origin HTTPS tunnel untuk server lokal alternatif, tanpa path, query, atau fragmen. Kosongkan untuk localhost. |
| `LOCAL_ADMIN_PASSWORD` | Password awal admin; dibuat otomatis jika kosong. |
| `LOCAL_MEMBER_PASSWORD` | Password awal anggota; dibuat otomatis jika kosong. |
| `LOCAL_PRODUCTS_SEEDED` | Penanda internal bahwa produk contoh sudah dibuat; dikelola oleh setup. |

Setup menetapkan email awal `admin@funding.local` dan `anggota@funding.local`, kemudian menyimpannya di environment. Nilai `LOCAL_ADMIN_EMAIL` dan `LOCAL_MEMBER_EMAIL` merupakan catatan akun hasil setup, bukan pengaturan untuk mengganti alamat akun. Mengubah nilai password di environment setelah akun dibuat juga tidak mengganti password akun tersebut.

### Database dan migrasi

```sh
npm run db:setup
npm run db:check
```

`db:setup` membuat atau menyalakan cluster proyek, menerapkan migrasi, serta menyiapkan akun dan stok contoh. Jika `DATABASE_URL` menunjuk database lokal yang sudah tersedia, setup menerapkan schema dan data awal di database tersebut. Gunakan database khusus aplikasi.

Cluster bawaan tersimpan di `.local/postgres/` pada direktori utama, memakai port `55432`, database `souvenir_tracking`, dan schema `souv`. `npm run db:start` merupakan alias `db:setup`; menjalankan server aplikasi saja tidak menyalakan PostgreSQL.

Migrasi dijalankan sesuai urutan nama berkas dan dicatat dengan checksum. Untuk mengubah schema atau fungsi SQL, tambahkan migrasi bernomor berikutnya. Pertahankan isi dan line ending migrasi yang sudah diterapkan agar checksum tetap cocok.

## Mode menjalankan aplikasi

| Perintah | Backend | Data | Alamat bawaan |
| --- | --- | --- | --- |
| `npm run dev` | Next.js | PostgreSQL jika dikonfigurasi | `http://localhost:3000` |
| `npm run build` lalu `npm start` | Next.js produksi | PostgreSQL jika dikonfigurasi | `http://localhost:3000` |
| `npm run preview:demo` | Server pratinjau | Data contoh tanpa penyimpanan | `http://localhost:3000` |
| `npm run local` | Server Node alternatif dengan handler API bersama | PostgreSQL lokal | `http://localhost:3000` |

Server alternatif menggunakan esbuild dan ditujukan untuk penggunaan lokal. Decoder `html5-qrcode` tidak dibundel pada mode ini; pembacaan QR mengandalkan kemampuan native browser jika tersedia. Gunakan Next.js untuk dukungan decoder cadangan.

Server Next.js mendengarkan pada `0.0.0.0`; server pratinjau dan server alternatif mendengarkan pada `127.0.0.1`. Semua mode memakai port 3000 secara bawaan, sehingga jalankan satu mode pada port tersebut dalam satu waktu.

## Pengujian

### Pemeriksaan dasar

```sh
npm run typecheck
npm test
npm run build
```

Unit test mencakup aturan domain, ekspor Excel, origin permintaan, password, dan sesi. Perintah `typecheck` serta `build` memerlukan dependensi aplikasi yang lengkap.

### Integrasi PostgreSQL

```sh
npm run test:db
```

Tes membaca koneksi dari `src/.env.local`, membuat fixture, lalu membersihkannya. Gunakan database pengujian terpisah dari data operasional. Cakupannya meliputi autentikasi, peran, transaksi stok bersamaan, idempotensi, pembatalan, penghapusan produk, foto, dan register.

### Tes browser

Instal Chromium, kemudian jalankan Playwright:

```sh
npx playwright install chromium
npm run test:e2e
```

Konfigurasi berada di [playwright.config.ts](playwright.config.ts) dan menjalankan proyek desktop serta mobile. Tes memakai fixture API; hasilnya tidak menggantikan tes integrasi PostgreSQL atau pengujian kamera HP fisik.

Playwright menyalakan server pengembangan jika diperlukan. Pastikan port 3000 tersedia atau server yang sudah berjalan merupakan instance pengujian yang sesuai. Untuk memakai server demo sebagai target, tetapkan environment `DEMO_PREVIEW=1` sebelum menjalankan tes. Browser lokal juga dapat ditentukan melalui `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Berkas hasil pengembangan

Lokasi berikut berada di direktori utama repo dan diabaikan Git:

| Lokasi | Isi |
| --- | --- |
| `arsip-lokal/preview/` | Bundle pratinjau dan arsip pemeriksaan tampilan. |
| `arsip-lokal/test-results/` | Artefak kegagalan dan trace Playwright. |
| `arsip-lokal/npm-cache/` | Cache npm, diatur oleh `.npmrc` pada root. |
| `arsip-lokal/tsconfig.tsbuildinfo` | Cache pemeriksaan TypeScript. |
| `.local/postgres/` | Cluster PostgreSQL proyek. |
| `src/.next/` | Hasil build dan cache Next.js. |

Dokumentasi perancangan, diagram, backup, dan ekspor operasional juga berada di `arsip-lokal/` pada mesin pengembangan; folder tersebut bukan bagian dari source yang dibagikan. Lisensi font lokal tersedia di [public/fonts/DM-Sans-LICENSE.txt](public/fonts/DM-Sans-LICENSE.txt).

## Kendala umum

| Gejala | Pemeriksaan |
| --- | --- |
| PowerShell memblokir `npm.ps1` | Gunakan `npm.cmd` untuk perintah npm. |
| `next`, `tsc`, atau dependensi lain tidak ditemukan | Jalankan `npm install` dari direktori utama repo. |
| PostgreSQL tidak dapat diakses | Periksa `DATABASE_URL`, `POSTGRES_BIN`, dan status database dengan `npm run db:check`; nyalakan cluster proyek melalui `npm run db:start`. |
| Tampilan memakai data demo | Periksa konfigurasi `src/.env.local` dan kesiapan database. Mode demo tidak menyimpan transaksi. |
| Kamera tidak tersedia di HP | Gunakan HTTPS atau localhost, berikan izin kamera, dan periksa lebar viewport. Pilihan barang manual tetap tersedia. |
| Port 3000 sudah digunakan | Hentikan server sebelumnya atau pilih port lain. Untuk Next.js, misalnya `npm run dev -- --port 3001`. |
