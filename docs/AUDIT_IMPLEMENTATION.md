# Hasil implementasi audit — 19 Oktober 2026

Perbaikan audit ini tidak mengubah database aplikasi/produksi. Mode bypass dipertahankan dengan default dan flag lama untuk kebutuhan testing. Hasil pengujian di bawah merupakan hasil verifikasi lokal sebelum commit/push; deployment mengikuti proses rilis repository.

## Pemetaan seluruh temuan

| ID audit | Tindakan |
| --- | --- |
| D01 | Enam komponen yang tidak terhubung ke halaman dihapus. Halaman dan navigasi aktif tetap tersedia. |
| D02 | snapToRailwayPoint, isLoopingActive, cn, dua helper inverse tile, serta enqueue/clear offline tanpa pemanggil dibersihkan. Modul induk yang masih aktif dipertahankan. |
| D03 | State setter verifikasi akhir dan wrapper tanpa efek dihapus; syarat foto/geofence tetap digunakan pada mode normal. |
| D04 | Import React dan import lain yang tidak dipakai dibersihkan. noUnusedLocals/noUnusedParameters diaktifkan di kedua modul. |
| D05 | Enam dependensi UI/peta yang tidak dipakai dan dua runner backend yang tidak dipakai dihapus. Paket CSS aktif dipertahankan. |
| D06 | Salinan test.tsx berkonflik, mockup code.html, dan font Geist yang tidak dipakai dihapus. Git menyimpan riwayatnya. |
| D07 | API lama dan model template historis sengaja dipertahankan untuk kompatibilitas; status fitur dan akses aktual didokumentasikan. Tidak ada drop tabel/endpoint aktif. |
| R01 | Admin controller dipisahkan menjadi account, assignment, monitoring, import, kategori dengan barrel kompatibilitas. Delapan tampilan/dialog admin serta hook kamera/GPS/polling dipisahkan. |
| R02 | Util jarak, format durasi, warna petugas, dan kontrak route dipusatkan di shared/. Perbedaan format tampilan yang disengaja dipertahankan. |
| R03 | Satu katalog stasiun dipakai backend/frontend; subset penugasan 15 stasiun dan guest 14 stasiun tetap berbeda dan urutannya dipertahankan. |
| R04 | Scope akses dan parsing wilayah dipusatkan; pembacaan data pengelola tidak mengulang query wilayah yang diabaikan. |
| R05 | Statistik admin tidak dihitung ulang untuk menimpa server; metadata QC tidak dipoll terus-menerus. Refresh parsial memakai allSettled, polling tidak bertumpuk, dan request polling diberi timeout. |
| R06 | Daftar dashboard memakai summary opt-in tanpa foto/rute besar dan memuat detail ketika modal dibuka. Riwayat PPJ admin memuat record lengkap saat dibuka. Respons API default tetap kompatibel. Nested tracking pada daftar insiden dipangkas. Pagination paksa tidak diterapkan karena akan mengubah hasil filter/riwayat klien lama. |
| R07 | Jarak tracking dimemoisasi; Dijkstra memakai stable minimum heap agar urutan tie tetap mengikuti implementasi lama. |
| R08 | Hasil geometri dari effect lama diabaikan; request geometri identik yang berjalan bersamaan dideduplikasi. |
| R09 | Hook kamera menghentikan stream pada close/unmount dan juga stream yang izinnya baru selesai setelah dialog ditutup. Kamera depan/belakang tetap sesuai tujuan. |
| R10 | Cache geocoding dibatasi 200 entri dengan expiry; request memiliki timeout 10 detik. |
| B01 | Scheduler memakai updateMany bersyarat status pending; tugas yang sudah diklaim start tidak ditimpa. |
| B02 | Scheduler mengejar tanggal sebelumnya setelah downtime dan tidak menandai tugas tanpa jam valid. |
| B03 | Aplikasi tetap online-first. Pesan offline diperjelas, writer antrean yang tidak digunakan dibersihkan, pembaca antrean historis dipertahankan dengan validasi API dan token sesi yang sama. |
| B04 | Route panjang diterima dan disimpan maksimal 20.000 titik dengan kedua endpoint dipertahankan; input invalid tetap ditolak. Frontend juga membatasi path lokal dan menyertakan posisi terakhir saat stop. |
| B05 | Key kategori/laporan disamakan maksimum 50 karakter, dan kategori baru harus aktif/terdaftar saat mengirim laporan. |
| B06 | Statistik memakai severity kategori saat ini seperti alarm UI; unknown legacy emergency/berat menjadi fallback. Kategori legacy yang direklasifikasi mengikuti konfigurasinya. |
| B07 | Foto laporan diperlebar menjadi LONGTEXT lewat migrasi. Tes benar-benar menyimpan PNG/base64 di atas kapasitas TEXT lama. |
| B08 | Tanggal/jam manual dan import memakai validator bersama; koordinat nol diterima, petugas harus PPJ aktif dalam kelolaan, dan titik awal/akhir harus berbeda. |
| B09 | Bypass tetap tersedia dan dites. Jalur normal menegakkan radius 500 meter dan kehadiran foto di server; bypass yang diizinkan melewati syarat tersebut dan jadwal. |
| I01 | Instalasi kedua modul diuji ulang dengan npm ci; manifest/lockfile selaras. Versi Node dicatat. Script native dependency yang diperlukan mempunyai allowScripts terpin. |
| I02 | TypeScript backend diperbaiki tanpa mematikan strict; config Prisma yang tidak kompatibel dihapus. Pemeriksaan tipe kedua modul termasuk unused berhasil. |
| I03 | Migrasi rekonsiliasi non-destruktif ditambahkan; seluruh riwayat diuji pada MySQL kosong dan diff schema kosong. Rekonsiliasi diulang pada database berisi fixture tanpa kehilangan data. |
| I04 | Seeder lama menjadi alias seeder aktif; placeholder workflow diganti CI nyata. README dan panduan agent diperbarui. |

## Hasil pengujian

- Backend: **65 tes lulus**, termasuk 59 tes sebelumnya, scheduler, scope, severity, cache, dan normalisasi jadwal.
- Frontend/shared: **7 tes lulus**, mencakup heap stabil, route shift panjang, lifecycle kamera, warna/distance/format, subset stasiun, status approval lama, proteksi replay legacy dan deduplikasi geometri.
- Integrasi HTTP/MySQL: **11 tes/subtes lulus**, mencakup login/hak akses, ID invalid, penugasan, geofence/foto mode normal, tracking milik orang lain, kategori panjang, foto besar, statistik, summary/detail, 28.800 titik GPS, approval, PDF nyata, bypass start/stop dan flag mati, import Excel, scheduler, migrasi idempoten, serta token akun yang dinonaktifkan.
- Total keluaran test runner: **83 lulus, 0 gagal**. Jumlah integrasi memasukkan satu test induk dan sepuluh subtes.
- Typecheck backend dan frontend: **lulus**, termasuk noUnusedLocals/noUnusedParameters.
- Lint frontend: **0 error**. Peringatan optimasi gambar/font lama tetap ada; lint tidak dimatikan untuk menyembunyikan error.
- Build produksi Next.js: **lulus**; seluruh sembilan route hasil build terbentuk.
- Instalasi bersih npm ci kedua modul: **lulus**; paket langsung tidak lagi invalid/extraneous.
- Migrasi baru: delapan migration berhasil pada MySQL 8.0.30 terpisah; `prisma migrate diff --exit-code` menunjukkan **No difference detected**.
- Migration rekonsiliasi dijalankan dua kali pada fixture terisi; jumlah pengguna dan isi tugas/laporan tetap ada.

## Cara mengulang

Dari root: `npm run verify`. Ini menjalankan test, typecheck, lint, dan build. Integrasi database terpisah menggunakan `npm run test:db` dari backend dengan AUDIT_DATABASE_URL sesuai [MIGRATIONS.md](MIGRATIONS.md).

CI baru di `.github/workflows/verify.yml` menjalankan verifikasi serta MySQL service terpisah. Workflow dipicu oleh push/pull request; status eksekusi GitHub diperiksa terpisah dari hasil lokal di laporan ini.

## Batas verifikasi dan deployment

Database aplikasi/produksi tidak disentuh. Migration harus diterapkan melalui proses rilis yang sesuai; database hasil db push memerlukan pemeriksaan baseline sebagaimana panduan migrasi. Perubahan foto/key laporan memerlukan schema baru pada backend yang dirilis.

Pengujian tidak mengoperasikan GPS/kamera fisik, kebijakan audio browser/perizinan perangkat, atau ketersediaan tile/Overpass di lapangan. Lifecycle kamera diuji dengan mock stream, dan geometri dengan fixture fetch. Hasil otomatis tidak menjanjikan ketiadaan seluruh bug pada semua perangkat; pengujian lapangan tetap diperlukan sebelum rilis operasional.

Normalisasi approval di dua sisi, worker pembersih PWA, fallback Overpass, pemeriksaan akun aktif, transaksi tracking, serta aturan scope tiap role tetap dipertahankan.
