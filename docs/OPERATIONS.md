# Operasional SOUV

Semua perintah dijalankan dari direktori utama repo. Pada PowerShell, gunakan `npm.cmd` jika `npm.ps1` diblokir.

## Status dan batas penggunaan

Proyek ini ditujukan untuk uji coba internal dengan operator yang mengelola Node.js dan PostgreSQL. Hasil tes lokal bukan sertifikasi keamanan, uji beban, atau bukti deployment produksi. Sebelum menggunakan data operasional, lakukan penerimaan pengguna, tetapkan penanggung jawab backup, dan verifikasi HTTPS serta hak akses di lingkungan tujuan.

Mode demo di browser tidak menyimpan data. Pada setup baru, akun admin dibuat otomatis; akun anggota dan stok contoh hanya dibuat jika `SEED_DEMO_DATA=1`. Pertahankan nilai `0` untuk database operasional baru. Pengaturan ini tidak menghapus data contoh yang sudah ada pada instalasi lama; lakukan rekonsiliasi stok sebelum dipakai.

## Konfigurasi dan pemisahan kredensial

| Lokasi | Isi | Siapa yang memerlukan |
| --- | --- | --- |
| `src/.env.local` | `DATABASE_URL` untuk akun runtime, konfigurasi aplikasi, password bootstrap | Proses aplikasi; operator untuk setup awal |
| `.local/database-admin.env` | `DATABASE_ADMIN_URL` untuk migrasi dan pemulihan | Operator, bukan proses deployment aplikasi |
| `src/.env.test.local` | Koneksi runtime dan admin database pengujian | Pengembang dan pengujian |

Ketiganya diabaikan Git. Batasi izin file dan direktori menggunakan ACL pada Windows atau izin filesystem pada Linux. Pada server produksi, berikan proses aplikasi hanya variabel runtime yang diperlukan; jangan sertakan kredensial admin atau password bootstrap dalam environment layanan. Simpan kredensial admin dalam pengelola rahasia atau direktori operator yang terlindungi.

Runtime dapat membaca data yang dibutuhkan API, mengelola sesi/foto, dan memanggil fungsi bisnis. Runtime tidak dapat mengubah schema, menulis stok langsung, atau memperbarui password langsung. Hak akses per pengguna tetap diperiksa API; runtime merupakan identitas layanan, bukan pengganti otorisasi aplikasi.

`npm run db:check` memeriksa koneksi, kesiapan fungsi sesi, dan penolakan hak admin/penulisan stok langsung.

## Instalasi dan upgrade

```sh
npm ci
npm run db:setup
npm run db:check
npm run typecheck
npm test
npm run build
npm start
```

Untuk upgrade instalasi lama, pastikan PostgreSQL berjalan, kemudian buat backup **sebelum** `db:setup` menerapkan migrasi. Pada cluster khusus proyek di Windows, bila belum berjalan:

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D '.local/postgres' -l '.local/postgres.log' -o '-p 55432 -h 127.0.0.1' -w start
npm run db:backup
npm run db:setup
```

Sesuaikan lokasi executable bila berbeda. `db:setup` tetap membaca checksum migrasi lama dan tidak mengubah password akun pengguna yang sudah ada. Upgrade pertama menyimpan koneksi pemilik lama di `.local/database-admin.env`, lalu mengganti `DATABASE_URL` aplikasi dengan akun terbatas. Restart aplikasi setelah perubahan environment.

Untuk database PostgreSQL yang dikelola sendiri, tetapkan koneksi admin hanya pada terminal operator sebelum `db:setup`:

```powershell
$env:DATABASE_ADMIN_URL='postgresql://operator:PASSWORD@HOST:5432/DATABASE?sslmode=verify-full'
npm run db:setup
Remove-Item Env:DATABASE_ADMIN_URL
```

Jangan menyimpan password asli dalam skrip yang masuk Git. Admin memerlukan izin membuat role dan mengelola objek aplikasi. Proses web memakai driver `pg` dengan pool maksimal 10 koneksi per proses; `psql` diperlukan untuk migrasi, sementara `initdb`, `pg_ctl`, dan `createdb` hanya diperlukan untuk cluster lokal otomatis. Pertimbangkan total koneksi saat menjalankan beberapa proses aplikasi. Untuk koneksi jarak jauh, gunakan TLS dan sertifikat tepercaya; jangan menonaktifkan verifikasi sertifikat.

## Backup dan pemulihan

```sh
npm run db:backup
npm run db:backup -- --output .local/backups/sebelum-upgrade.dump
```

Backup memakai `pg_dump` berformat custom dan mencakup schema serta data, termasuk foto, hash password, dan sesi. File tidak ditimpa jika sudah ada. Path relatif dihitung dari direktori utama repo. Gunakan `pg_dump` dengan versi yang mendukung server PostgreSQL tujuan; cara termudah adalah memakai binary dari instalasi PostgreSQL yang sama.

Backup tidak mencakup kredensial role PostgreSQL atau file environment. Cadangkan konfigurasi operator secara terpisah dengan perlindungan akses. Salin backup secara berkala ke penyimpanan terpisah yang terenkripsi dan uji pemulihannya. Frekuensi dan retensi harus ditetapkan berdasarkan jumlah data yang boleh hilang; memiliki file di komputer yang sama belum melindungi dari kerusakan komputer.

```sh
npm run db:restore -- --file .local/backups/sebelum-upgrade.dump --database souvenir_restore_20261116
```

Restore hanya membuat database baru dengan nama berakhiran `_restore` atau `_restore_<label>`. Database yang sudah ada tidak ditimpa. Data sumber tetap utuh. Restore menggunakan satu transaksi; jika gagal, database tujuan yang kosong dapat tertinggal untuk diperiksa operator.

Sebelum beralih ke hasil restore:

1. Cocokkan jumlah produk/transaksi, stok, foto, dan sampel register dengan sumber atau catatan backup.
2. Cabut sesi yang ikut tercadangkan melalui koneksi admin: `DELETE FROM souv.sessions;` pada **database hasil restore**.
3. Jalankan migrasi dan penyediaan akun runtime pada target melalui `db:setup` di environment operator/deployment terpisah yang menunjuk target. Pertahankan `SEED_DEMO_DATA=0`.
4. Jalankan `db:check`, uji login dan transaksi dengan akun yang sesuai, lalu ubah koneksi layanan aplikasi dan restart layanan.
5. Simpan database sumber sampai verifikasi selesai. Jangan menghapus sumber sebagai bagian dari pengujian restore.

## Password dan pemulihan akun

Pengguna dapat memilih tombol **Ubah password** pada header. Password baru harus 12–128 karakter; password saat ini wajib benar. Perubahan mencabut semua sesi lama dan membuat sesi baru untuk perangkat yang melakukan perubahan.

Jika pengguna atau admin lupa password, operator database dapat menjalankan:

```sh
npm run account:reset -- --email admin@funding.local
```

Perintah hanya mereset akun aktif yang sudah ada. Password acak disimpan di `.local/account-recovery/`, bukan dicetak ke terminal; semua sesi akun dicabut. Sampaikan melalui saluran yang sesuai, minta pengguna menggantinya setelah login, lalu hapus file pemulihan. Mengubah password bootstrap di `.env.local` tidak mengganti password akun yang sudah dibuat.

## Pengujian dan rilis

```sh
npm run db:test:setup
npm run test:db
npx playwright install chromium
npm run test:e2e
```

Tes integrasi hanya membaca `src/.env.test.local` atau variabel `TEST_DATABASE_URL`/`TEST_DATABASE_ADMIN_URL`, dan menolak nama database yang tidak berakhir `_test`. Akun runtime dipakai handler API; akun admin hanya membuat dan membersihkan fixture. Jangan menunjuk konfigurasi pengujian ke data operasional meskipun namanya berakhir `_test`.

Playwright memakai port 3100 dan menyalakan server tersendiri. Untuk port lain, tetapkan `E2E_PORT`; untuk browser lokal, tetapkan `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Tes browser memakai fixture API. Tes integrasi database melengkapi pengujian itu dengan sesi, otorisasi, transaksi bersamaan, pagination, ekspor lebih dari 5.000 catatan, dan pergantian password.

GitHub Actions menjalankan typecheck, unit test, build, audit dependensi, integrasi PostgreSQL, dan browser desktop/HP. Pastikan semua job lolos pada commit yang akan dirilis. Pengaturan branch protection harus diaktifkan oleh pengelola repo di GitHub setelah workflow tersedia.

## Pencatatan gangguan

Kesalahan server yang tidak diharapkan dikembalikan sebagai respons umum; log berisi jenis kejadian dan kode kesalahan tanpa SQL, parameter, atau kredensial. Arahkan stderr/stdout layanan ke sistem log yang aksesnya dibatasi. Tetapkan pemantauan layanan dan kapasitas database di lingkungan deployment; repo belum menyediakan layanan monitoring terkelola.

Riwayat transaksi stok tersimpan di database. Perubahan produk dan akun belum merupakan audit trail lengkap untuk kebutuhan kepatuhan organisasi.
