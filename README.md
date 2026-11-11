# Souvenir Tracking

**SOUV** adalah aplikasi pencatatan stok dan distribusi souvenir untuk tim funding, dengan tampilan desktop dan HP serta hak akses admin dan anggota. Aplikasi menggunakan Next.js, React, TypeScript, dan PostgreSQL lokal.

## Struktur proyek

```text
src/              Source aplikasi, konfigurasi, migrasi, aset, dan pengujian
arsip-lokal/      Dokumentasi internal, backup, ekspor, cache, dan hasil review
package.json      Pintasan perintah aplikasi dari direktori utama
```

`arsip-lokal/` diabaikan Git. Runtime database yang sudah ada tetap di `.local/` dan juga diabaikan Git.

## Menjalankan secara lokal

Siapkan Node.js 22 atau lebih baru, npm, dan PostgreSQL. Dari direktori utama:

```sh
npm install
```

Salin `src/.env.example` menjadi `src/.env.local` dan sesuaikan `POSTGRES_BIN` dengan folder `bin` PostgreSQL. Lalu jalankan:

```sh
npm run db:setup
npm run db:check
npm run dev
```

Buka `http://localhost:3000`. Akun awal dan password hasil setup tersimpan di `src/.env.local`. Jika `DATABASE_URL` kosong, setup membuat database khusus proyek beserta akun dan stok contoh. Backend memerlukan executable `psql` dan hanya menerima database di host lokal.

Untuk melihat tampilan tanpa database, jalankan `npm run preview:demo`. Pratinjau memakai data contoh dan tidak menyimpan perubahan.

Pada Windows PowerShell yang memblokir `npm.ps1`, gunakan `npm.cmd` sebagai pengganti `npm`.

## Build dan pengujian

```sh
npm run typecheck
npm test
npm run build
npm start
```

Panduan fitur, konfigurasi, dan pengujian lanjutan tersedia di [src/README.md](src/README.md).

## Berkas lokal

Dokumentasi sistem, diagram, skrip pemeriksaan lama, backup, ekspor, cache, dan screenshot dikumpulkan di `arsip-lokal/`. Folder ini tidak disertakan saat commit ke GitHub. Daftar pemindahan dan checksum disimpan secara lokal di `arsip-lokal/manifest.json`.

Dependensi, hasil build, konfigurasi `.env.local`, dan runtime database juga diabaikan Git. Templat `src/.env.example` tetap disertakan. Jika mengunggah manual lewat browser, jangan pilih `arsip-lokal/`, `.local/`, `node_modules/`, atau `src/.env.local`.
