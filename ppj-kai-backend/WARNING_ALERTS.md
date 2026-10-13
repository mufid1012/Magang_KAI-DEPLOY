# Warning kereta pada jalur bersinggungan

Dua jalur terkait jika berbagi minimal satu stasiun setelah normalisasi nama.
Kedua nama stasiun harus tersedia. Pencocokan hanya memakai stasiun awal/akhir,
tanpa meneruskan warning secara transitif ke jalur lain.

Penerima dipilih dari tracking `started` dengan tugas `in_progress`, selain
pengirim, menggunakan GPS yang diperbarui maksimal dua menit lalu. Satu pengguna
diwakili sesi terbaru yang eligible. Untuk **setiap pasangan stasiun terkait**,
pilih satu PPJ terdekat pada masing-masing sisi pengirim. Pasangan terbalik atau
berbeda format tetap masuk kelompok yang sama. Sisi dihitung dengan proyeksi GPS
pada sumbu stasiun awal–akhir pengirim. Tidak ada batas radius jarak.

Contoh: pengirim A–B, dua penerima pada A–B dan dua pada B–C dapat menerima
warning yang sama. C–D tidak eligible. Total penerima tidak dibatasi dua slot.

`warning_recipients` menyimpan seluruh sesi penerima secara atomik bersama
warning. Polling memakai relasi ini, masa berlaku, dan pengecekan overlap ulang.
Penghapusan warning atau tracking otomatis menghapus relasi penerimanya.

Respons POST/GET tetap memakai field lama, termasuk `recipientOneTrackingId`
dan `recipientTwoTrackingId` sebagai proyeksi dua penerima pertama untuk
kompatibilitas. Field ini tidak dipakai untuk menentukan hak menerima warning.
Relasi internal `recipients` tidak dikirim dalam respons. `trainDirectionName`
tetap berasal dari `endPointName` pengirim. TTL dua menit, cooldown 30 detik,
dan batas 50 warning pada respons polling tetap berlaku.

## Pembaruan database

Jalankan dari folder backend. Untuk database yang memakai histori Prisma Migrate:

```powershell
npx prisma migrate deploy
npx prisma db push
npx prisma generate
```

Migrasi `20261013120000_add_warning_recipients` membuat tabel relasi, menyalin
dua slot penerima lama yang tracking-nya masih ada, lalu menghapus kolom lama.
Duplikasi slot dan referensi tracking yang sudah hilang tidak disalin.

Untuk database lama yang hanya memakai `db push` dan belum memiliki histori
migrasi, jalankan SQL baru satu kali **sebelum** `db push`, saat kolom lama masih
ada dan tabel `warning_recipients` belum ada:

```powershell
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261013120000_add_warning_recipients/migration.sql
npx prisma db push
npx prisma generate
```

`db push` langsung pada database lama tidak menyalin penerima lama. Jangan pakai
`--accept-data-loss` untuk melewati pemindahan tersebut. Database baru yang
kosong dapat langsung memakai `npx prisma db push` dan `npx prisma generate`.

## Verifikasi

```powershell
npx tsx --test src/utils/warningRoute.test.ts src/controllers/warning.test.ts
npm test
```
