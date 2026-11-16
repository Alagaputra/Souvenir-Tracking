# Panduan pengembangan SOUV

Panduan ini menjelaskan pembagian kode, konfigurasi, API, dan pengujian. Untuk fitur serta instalasi awal, baca [README utama](../README.md). Prosedur upgrade, backup, restore, deployment, dan pemulihan akun ada di [panduan operasional](../docs/OPERATIONS.md).

**Semua perintah dalam panduan ini dijalankan dari direktori utama repo.** `package.json` di root meneruskan perintah ke aplikasi dalam `src/`; frontend dan backend Next.js berjalan melalui `npm run dev` yang sama.

Dependensi dikelola sebagai npm workspace dengan satu `package-lock.json` di root. Gunakan `npm ci` untuk instalasi sesuai lockfile; tambahkan dependensi aplikasi melalui workspace `src`.

## Peta kode

### Frontend

| Lokasi | Fungsi |
| --- | --- |
| [app/page.tsx](app/page.tsx) | Titik masuk halaman workspace. |
| [app/layout.tsx](app/layout.tsx) | Layout utama, metadata, dan bahasa halaman. |
| [components/workspace.tsx](components/workspace.tsx) | Koordinasi state, navigasi, dashboard, form transaksi, dialog, dan aksi pengguna. |
| [components/workspace-types.ts](components/workspace-types.ts) | Tipe halaman dan dialog workspace. |
| [components/product-table.tsx](components/product-table.tsx), [components/product-art.tsx](components/product-art.tsx) | Tabel produk, foto/ikon, dan status stok. |
| [components/history-panel.tsx](components/history-panel.tsx) | Filter riwayat, status pemuatan/kegagalan, retry, dan navigasi halaman. |
| [components/history-table.tsx](components/history-table.tsx), [components/mobile-history.tsx](components/mobile-history.tsx) | Tabel desktop dan daftar riwayat HP. |
| [lib/use-history.ts](lib/use-history.ts) | Pengambilan riwayat, pembatalan respons lama, pagination, dan ekspor seluruh hasil filter. |
| [components/quick-scan.tsx](components/quick-scan.tsx) | Panel pemindaian dan transaksi pada HP. |
| [components/live-scanner.tsx](components/live-scanner.tsx) | Akses kamera serta pembacaan QR. |
| [components/ui/](components/ui/) | Komponen UI yang digunakan bersama. |
| [app/globals.css](app/globals.css), [app/theme.css](app/theme.css) | Stylesheet aplikasi dan tema. |

### Backend

| Lokasi | Fungsi |
| --- | --- |
| [app/api/](app/api/) | Route handlers Next.js; meneruskan permintaan ke handler API bersama. |
| [lib/local-api.mjs](lib/local-api.mjs) | Dispatcher API, pemeriksaan peran, operasi produk/stok, unggahan, dan register. |
| [lib/auth-api.mjs](lib/auth-api.mjs) | Login, logout, pemeriksaan sesi, dan profil pengguna. |
| [lib/account-api.mjs](lib/account-api.mjs) | Verifikasi password saat ini, perubahan password, dan rotasi sesi. |
| [lib/history-api.mjs](lib/history-api.mjs) | Filter riwayat, pagination, ekspor lengkap, dan agregasi bulanan dalam WIB. |
| [lib/http.mjs](lib/http.mjs) | Respons JSON, kesalahan HTTP, validasi origin/UUID, dan pembatasan ukuran body. |
| [lib/local-db.mjs](lib/local-db.mjs) | Konfigurasi koneksi, query berparameter, dan pool koneksi melalui driver `pg`; `psql` untuk migrasi. |
| [lib/local-security.mjs](lib/local-security.mjs) | Hash password, token sesi, dan cookie. |
| [lib/public-origin.mjs](lib/public-origin.mjs) | Validasi dan penyusunan URL untuk server lokal alternatif. |
| [db/migrations/](db/migrations/) | Schema, constraint, penguncian transaksi, dan fungsi SQL. |

Otorisasi diperiksa di backend dan fungsi database. Pembatasan tombol atau menu di frontend hanya mengatur tampilan. Modul backend inti dan aturan domain memakai `@ts-check`, sehingga masuk pemeriksaan TypeScript tanpa harus mengubah ekstensi `.mjs`.

Aplikasi memakai pool maksimal 10 koneksi per proses dan mengirim parameter SQL terpisah dari teks query. Fungsi SQL menangani penguncian stok, idempotensi berdasarkan `request_id`, pembatalan transaksi, serta pembuatan dan pencabutan sesi. Kredensial admin digunakan oleh alat operator, terpisah dari koneksi runtime aplikasi.

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
| `GET` | `/api/workspace` | Produk, 25 aktivitas terbaru, ringkasan bulanan lengkap, dan akun sesuai hak akses. |
| `GET` | `/api/history` | Riwayat dengan filter server, pagination, dan ekspor lengkap. |
| `POST` | `/api/account` | Ubah password dengan verifikasi password saat ini dan rotasi sesi. |
| `POST` | `/api/workspace` | Pencatatan stok serta pengelolaan produk. |
| `POST` | `/api/members` | Pembuatan dan perubahan status akun oleh admin. |
| `POST` | `/api/upload` | Unggah foto produk oleh admin. |
| `GET` | `/api/photos/:id` | Membaca foto untuk pengguna yang terautentikasi. |
| `GET` | `/api/register` | Snapshot lengkap produk dan transaksi untuk register admin. |

`/api/register` mengembalikan data JSON. Berkas `.xlsx` dirangkai di browser oleh modul ekspor. Permintaan yang mengubah data memerlukan header `Origin` yang sesuai; operasi terautentikasi memakai cookie sesi.

### Riwayat dan ringkasan

`GET /api/workspace` mengembalikan 25 aktivitas terbaru untuk tampilan ringkas. Ringkasan bulanan dihitung terpisah dari seluruh transaksi yang sesuai hak akses. Riwayat lengkap dan ekspornya memakai `GET /api/history`.

| Parameter | Aturan |
| --- | --- |
| `search` | Mencari nama barang, penerima, dan petugas; maksimal 160 karakter. |
| `from`, `to` | Tanggal `YYYY-MM-DD`, inklusif dalam WIB; tanggal awal tidak boleh melewati tanggal akhir. |
| `kind` | `in`, `out`, `adjust`, atau `reversal`. |
| `product`, `actor` | UUID produk atau petugas. |
| `page` | Mulai dari 1; maksimal 1.000.000. |
| `pageSize` | 1 sampai 100; bawaan 25. |
| `export` | Nilai `1` mengambil seluruh hasil filter tanpa batas halaman. |

Respons berisi `movements`, `total`, `page`, dan `pageSize`. Jumlah hasil dan baris berasal dari satu snapshot database. Pembatasan anggota tetap berlaku meskipun parameter `actor` menunjuk pengguna lain. Ekspor tidak dibatasi oleh halaman yang terlihat maupun 5.000 transaksi terbaru.

### Password dan validasi permintaan

`POST /api/account` menerima `current_password` dan `new_password`. Password baru harus 12–128 karakter dan berbeda dari password saat ini. Setelah berhasil, semua sesi lama dicabut dan respons mengirim cookie sesi baru. Pembuatan sesi memeriksa ulang hash password untuk menolak login yang memakai password lama saat terjadi perubahan bersamaan.

Body JSON dibatasi **16 KiB**. Body unggahan dibatasi sebelum parsing multipart; file foto maksimal **2 MiB**, dengan pemeriksaan MIME dan penanda byte JPG, PNG, atau WebP. Kesalahan yang tidak diharapkan dikembalikan sebagai pesan umum; log aplikasi tidak memuat SQL, parameter, atau kredensial.

## Konfigurasi environment

Templat konfigurasi tersedia di [.env.example](.env.example). Aplikasi membaca `src/.env.local`. Alat operator juga dapat membaca `.local/database-admin.env`; runner tes database membaca `src/.env.test.local`. Semua file yang berisi kredensial ini diabaikan Git.

| Variabel | Penggunaan |
| --- | --- |
| `DATABASE_URL` | URL akun runtime PostgreSQL. Jika kosong saat setup, cluster proyek dibuat otomatis. Koneksi admin untuk migrasi dipisahkan di `.local/database-admin.env`. |
| `DATABASE_ADMIN_URL` | Koneksi operator untuk migrasi, penyediaan role, backup, restore, dan pemulihan akun. Tetapkan saat menjalankan alat operator atau simpan melalui setup di `.local/database-admin.env`. |
| `POSTGRES_BIN` | Folder binary PostgreSQL. Migrasi memakai `psql`; cluster lokal otomatis membutuhkan `initdb`, `pg_ctl`, dan `createdb`. Query aplikasi memakai driver `pg`. |
| `APP_PUBLIC_ORIGIN` | Origin HTTPS tunnel untuk server lokal alternatif, tanpa path, query, atau fragmen. Kosongkan untuk localhost. |
| `LOCAL_ADMIN_PASSWORD` | Password awal admin; dibuat otomatis jika kosong. |
| `LOCAL_MEMBER_PASSWORD` | Password awal anggota contoh jika `SEED_DEMO_DATA=1`; dibuat otomatis jika kosong. |
| `SEED_DEMO_DATA` | `0` secara bawaan; `1` untuk akun anggota dan stok contoh. |
| `LOCAL_PRODUCTS_SEEDED` | Penanda internal bahwa produk contoh sudah dibuat; dikelola oleh setup. |
| `TEST_DATABASE_URL` | Koneksi runtime database tes; disimpan oleh `db:test:setup` di `src/.env.test.local`. |
| `TEST_DATABASE_ADMIN_URL` | Koneksi fixture database tes; disimpan terpisah dari konfigurasi aplikasi. |
| `TEST_DATABASE_NAME` | Nama target `db:test:setup`; bawaan `souvenir_tracking_test`, wajib berakhir `_test`. |

Setup menetapkan email admin `admin@funding.local`. Akun contoh `anggota@funding.local` dibuat hanya jika `SEED_DEMO_DATA=1`. Nilai `LOCAL_ADMIN_EMAIL` dan `LOCAL_MEMBER_EMAIL` merupakan catatan bootstrap, bukan pengaturan untuk mengganti alamat akun. Mengubah nilai password di environment setelah akun dibuat juga tidak mengganti password akun tersebut.

Proses aplikasi pada deployment hanya memerlukan kredensial runtime; berikan kredensial admin kepada alat operator sesuai [panduan operasional](../docs/OPERATIONS.md#konfigurasi-dan-pemisahan-kredensial).

### Database dan migrasi

```sh
npm run db:setup
npm run db:check
```

`db:setup` membuat atau menyalakan cluster proyek, menerapkan migrasi, serta menyiapkan admin dan akun database runtime terbatas. Akun anggota dan stok contoh hanya dibuat jika `SEED_DEMO_DATA=1`. Untuk server PostgreSQL yang sudah ada, tetapkan `DATABASE_ADMIN_URL` pada terminal operator. Gunakan database khusus aplikasi.

Cluster bawaan tersimpan di `.local/postgres/` pada direktori utama, memakai port `55432`, database `souvenir_tracking`, dan schema `souv`. `npm run db:start` merupakan alias `db:setup`; menjalankan server aplikasi saja tidak menyalakan PostgreSQL.

Migrasi dijalankan sesuai urutan nama berkas dan dicatat dengan checksum. Untuk mengubah schema atau fungsi SQL, tambahkan migrasi bernomor berikutnya. Pertahankan isi migrasi yang sudah diterapkan. Checksum menggunakan LF; checksum lama dengan CRLF dikenali dan dinormalisasi agar perpindahan Windows/Linux tidak dianggap perubahan isi.

[scripts/database-admin.mjs](scripts/database-admin.mjs) menangani migrasi dan penyediaan role runtime. [scripts/setup-local.mjs](scripts/setup-local.mjs) mengoordinasikan cluster lokal, akun awal, data contoh opsional, dan penyimpanan konfigurasi. Untuk instalasi yang sudah memiliki data, buat backup sebelum menjalankan migrasi.

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

`typecheck` menjalankan `next typegen` sebelum `tsc --noEmit`, sehingga tipe route tersedia pada clone baru. `next-env.d.ts` dan tipe dalam `.next/` dihasilkan otomatis dan diabaikan Git.

Unit test mencakup aturan domain, ekspor Excel, origin permintaan, password, sesi, format JSON, dan pembatasan ukuran body. Perintah `typecheck` serta `build` memerlukan dependensi aplikasi yang lengkap.

### Integrasi PostgreSQL

```sh
npm run db:test:setup
npm run test:db
```

`db:test:setup` memerlukan koneksi admin yang dapat membuat database dan role, serta binary `psql`. Perintah ini menyiapkan database tes terpisah dan menulis konfigurasi ke `src/.env.test.local`. PostgreSQL harus sudah berjalan.

Runner tes hanya membaca file tersebut atau variabel `TEST_DATABASE_URL`/`TEST_DATABASE_ADMIN_URL`, dan menolak nama database yang tidak berakhir `_test`. Gunakan database khusus tes tanpa data operasional. Akun admin membuat dan membersihkan fixture; handler API memakai akun runtime terbatas.

Cakupannya meliputi autentikasi, CSRF, pembatasan peran, penolakan penulisan stok/schema langsung, transaksi bersamaan, idempotensi, pembatalan, penghapusan produk, foto, register, filter WIB, pagination dan ekspor di atas 5.000 catatan, pergantian password, serta pemulihan akun melalui operator.

### Tes browser

Instal Chromium, kemudian jalankan Playwright:

```sh
npx playwright install chromium
npm run test:e2e
```

Konfigurasi berada di [playwright.config.ts](playwright.config.ts) dan menjalankan proyek desktop serta mobile. Tes memakai fixture API; hasilnya tidak menggantikan tes integrasi PostgreSQL atau pengujian kamera HP fisik.

Playwright menyalakan server pengembangan tersendiri pada port **3100** dan menolak memakai server yang sudah berjalan di port itu. Tes mencakup tampilan responsif, label QR, pemindaian yang disimulasikan, penghapusan produk, ekspor Excel, retry, pergantian halaman riwayat, penolakan respons pencarian lama, dan form ubah password.

| Variabel runner | Kegunaan |
| --- | --- |
| `E2E_PORT` | Mengganti port server tes; bawaan 3100. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Menggunakan executable Chromium/Chrome lokal. |
| `DEMO_PREVIEW` | Nilai `1` menjalankan server demo sebagai target. |

### CI dan hasil verifikasi

[Workflow GitHub Actions](../.github/workflows/ci.yml) menyediakan tiga job: pemeriksaan aplikasi pada Node.js 22/24, integrasi PostgreSQL 18, dan tes browser desktop/HP. Artefak kegagalan browser diunggah untuk pemeriksaan. Hasil verifikasi lokal terakhir dicatat di [README utama](../README.md#kualitas-dan-verifikasi); hasil workflow harus diperiksa pada commit yang akan dirilis.

## Perintah operasional

```sh
npm run db:backup
npm run db:restore -- --file .local/backups/sebelum-upgrade.dump --database souvenir_restore_20261116
npm run account:reset -- --email admin@funding.local
```

Backup disimpan di `.local/backups/` secara bawaan. Restore hanya membuat database baru dan menolak menimpa target yang sudah ada. Pemulihan akun menyimpan password acak di `.local/account-recovery/` dan mencabut sesi lama. Semua perintah ini memerlukan koneksi admin. Ikuti [panduan operasional](../docs/OPERATIONS.md) untuk perlindungan file, verifikasi restore, dan perpindahan koneksi aplikasi.

## Berkas hasil pengembangan

Lokasi berikut berada di direktori utama repo dan diabaikan Git:

| Lokasi | Isi |
| --- | --- |
| `arsip-lokal/preview/` | Bundle pratinjau dan arsip pemeriksaan tampilan. |
| `arsip-lokal/test-results/` | Artefak kegagalan dan trace Playwright. |
| `arsip-lokal/npm-cache/` | Cache npm, diatur oleh `.npmrc` pada root. |
| `arsip-lokal/tsconfig.tsbuildinfo` | Cache pemeriksaan TypeScript. |
| `.local/postgres/` | Cluster PostgreSQL proyek. |
| `.local/database-admin.env` | Kredensial admin untuk alat operator. |
| `.local/backups/` | Backup dari `db:backup`. |
| `.local/account-recovery/` | File password sementara dari pemulihan akun. |
| `src/.env.local`, `src/.env.test.local` | Konfigurasi aplikasi dan pengujian. |
| `src/.next/` | Hasil build dan cache Next.js. |
| `src/next-env.d.ts` | Referensi tipe Next.js yang dihasilkan otomatis. |

Arsip pengembangan dan ekspor lokal juga dapat berada di `arsip-lokal/`; folder tersebut bukan bagian dari source yang dibagikan. Lisensi font lokal tersedia di [public/fonts/DM-Sans-LICENSE.txt](public/fonts/DM-Sans-LICENSE.txt).

## Kendala umum

| Gejala | Pemeriksaan |
| --- | --- |
| PowerShell memblokir `npm.ps1` | Gunakan `npm.cmd` untuk perintah npm. |
| `next`, `tsc`, atau dependensi lain tidak ditemukan | Jalankan `npm ci` dari direktori utama repo. |
| PostgreSQL tidak dapat diakses | Periksa koneksi `DATABASE_URL` dan status server. Gunakan `db:check` setelah server berjalan. `POSTGRES_BIN` diperlukan alat setup/migrasi, bukan query aplikasi. |
| Akun runtime terlalu luas atau migrasi belum lengkap | Ikuti panduan backup/upgrade, jalankan `db:setup`, lalu `db:check` dan restart aplikasi. |
| Tes database menolak konfigurasi | Jalankan `db:test:setup`; pastikan kedua koneksi tes menunjuk database khusus berakhiran `_test`. |
| Executable browser Playwright tidak ditemukan | Jalankan `npx playwright install chromium` atau tetapkan `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. |
| Tampilan memakai data demo | Periksa konfigurasi `src/.env.local` dan kesiapan database. Mode demo tidak menyimpan transaksi. |
| Kamera tidak tersedia di HP | Gunakan HTTPS atau localhost, berikan izin kamera, dan periksa lebar viewport. Pilihan barang manual tetap tersedia. |
| Port 3000 sudah digunakan | Hentikan server sebelumnya atau pilih port lain. Untuk Next.js, misalnya `npm run dev -- --port 3001`. |
| Port tes 3100 sudah digunakan | Hentikan instance tes yang lama atau pilih port lain melalui `E2E_PORT`. |
| Lupa password atau nilai bootstrap sudah diubah | Gunakan menu ubah password jika masih mengetahui password saat ini, atau minta operator menjalankan `account:reset`. |
