# Migrasi database

## Database baru yang kosong
Gunakan Node 24, `npm ci` di backend, isi DATABASE_URL, lalu jalankan `npx prisma migrate deploy` dan `npx prisma generate`. Seluruh migrasi di `prisma/migrations` membangun schema terkini; hasilnya diperiksa dengan `prisma migrate diff` pada MySQL 8.0.30.

## Database yang memiliki riwayat migrasi
Backup dahulu dan uji pada salinan. Jalankan `npx prisma migrate status`; tinjau migration `20261019120000_complete_legacy_schema`, lalu deploy menggunakan proses rilis biasa. Migration ini menambahkan kolom/tabel yang hilang secara idempoten, memperlebar foto laporan menjadi LONGTEXT dan key laporan menjadi VARCHAR(50), menyamakan default/role petugas lama menjadi ppj, serta melengkapi foreign key manager.

Tidak ada tabel/baris yang dihapus. Foreign key manager dapat menolak data lama yang berisi manager_id tidak valid; periksa dan koreksi referensi pada salinan sebelum deploy. Jangan menonaktifkan foreign key check untuk memaksa keberhasilan.

## Database lama yang berasal dari db push
`migrate deploy` dapat menolak database nonkosong tanpa riwayat. Jangan memakai reset atau `--accept-data-loss`.

1. Backup, catat schema/data aktual, dan buat salinan staging.
2. Bandingkan schema dengan schema.prisma memakai `prisma migrate diff --from-url <URL_STAGING> --to-schema-datamodel prisma/schema.prisma --script`.
3. Tinjau SQL rekonsiliasi baru. Bila tujuh migrasi sebelumnya sudah terwakili oleh schema aktual, baseline tujuh migration tersebut satu per satu menggunakan `prisma migrate resolve --applied <NAMA_MIGRASI>` pada staging. Jangan menandai migrasi yang efeknya belum ada.
4. Jalankan migration baru pada staging, cek diff menjadi kosong, lalu jalankan suite integrasi pada database khusus test.
5. Terapkan prosedur yang sudah tervalidasi pada rilis database lama. Simpan backup dan catatan baseline.

Backend tidak lagi membuat tabel MAP/foto login saat runtime; kedua tabel berasal dari migrasi `20260718170000_add_map_locations` dan `20261014120000_add_login_photos`, sehingga user database produksi tidak memerlukan hak CREATE.

## Pengujian integrasi
Suite hanya menerima AUDIT_DATABASE_URL dengan host 127.0.0.1 dan nama database berawalan ppj_audit. Suite membuat fixture; tidak menghapus data aplikasi lain. Jalankan hanya pada instance/database test yang dapat dibuang.

PowerShell, dari backend:

```powershell
$env:DATABASE_URL='mysql://USER:PASSWORD@127.0.0.1:3306/ppj_audit_test'
$env:AUDIT_DATABASE_URL=$env:DATABASE_URL
npx prisma migrate deploy
npx prisma migrate diff --from-url $env:DATABASE_URL --to-schema-datamodel prisma/schema.prisma --exit-code
npm run test:db
```

Pengujian lokal perbaikan ini memakai instance MySQL terpisah pada port 33467. Database aplikasi dari .env tidak dimigrasi atau direset.

## Telemetri kecepatan PPJ
Migrasi `20261019150000_tracking_telemetry` bersifat additive: menambah tabel sampel/kejadian beserta indeks, FK cascade ke tracking, dan state/ringkasan serta waktu/accuracy posisi terakhir. Tidak mengubah `routePath` atau mengisi speed data historis. Deploy migrasi dan generate Prisma Client sebelum backend/frontend baru. Metode, API, retensi dan checklist perangkat ada di [TELEMETRY.md](TELEMETRY.md).

## Hentikan paksa inspeksi
Migrasi `20261115120000_tracking_forced_stop` bersifat additive: menambah kolom nullable `forced_stop_by` (FK ke users, SET NULL), `forced_stop_at`, dan `forced_stop_reason` pada `tracking`. Baris lama tetap bernilai NULL. Deploy migrasi dan generate Prisma Client sebelum backend baru, karena endpoint `POST /api/admin/tracking/:id/force-stop` dan PDF membaca kolom ini.

## Tolak hasil, akhiri lebih awal, cabut token, log audit
Migrasi `20261126120000_review_audit_token` bersifat additive: `users.token_version` (default 0), kolom nullable `rejected_by` (FK SET NULL), `rejected_at`, `rejection_reason`, `early_stop_reason` pada `tracking`, serta tabel baru `admin_audit_log`. Tidak ada data lama yang diubah; token yang sudah beredar tetap sah sampai password akun diganti. Deploy migrasi dan generate Prisma Client sebelum backend baru, karena login, middleware auth, approval, dan PDF membaca kolom ini.
