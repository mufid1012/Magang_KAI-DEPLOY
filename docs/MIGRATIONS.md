# Migrasi database

## Database baru yang kosong
Gunakan Node 24, `npm ci` di backend, isi DATABASE_URL, lalu jalankan `npx prisma migrate deploy` dan `npx prisma generate`. Seluruh delapan migrasi membangun schema terkini; hasilnya diperiksa dengan `prisma migrate diff` pada MySQL 8.0.30.

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

Helper pembuat tabel MAP/foto login tetap tersedia untuk kompatibilitas. Helper itu tidak menggantikan migrasi seluruh schema.

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
