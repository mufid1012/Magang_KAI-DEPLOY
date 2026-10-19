# Panduan proyek KAI RailTrack PPJ

## Alur dan batasan
- Next.js 16/React 19 frontend; Express 5, Prisma 5, MySQL 8 backend. Gunakan Node 24 (`.nvmrc`).
- Role: admin, qc, kupt, guest, ppj. Alur PPJ tetap login -> /inspeksi -> /inspeksi/[id] -> /inspeksi/[id]/selesai.
- Bypass WAJIB dipertahankan untuk testing sampai pemilik proyek meminta perubahan. Kedua flag `TRACKING_BYPASS_ENABLED` dan `NEXT_PUBLIC_TRACKING_BYPASS_ENABLED` tersedia jika bukan `false`; request harus mengirim `bypassMode: true`. Jangan mengubah default diam-diam.
- Mode normal memerlukan foto dan posisi dalam radius 500 m pada start/stop; server memvalidasinya. Bypass tetap melewati syarat tersebut dan jendela waktu.
- Start hanya pending (atau missed dengan bypass); stop -> need_approval; approval admin -> completed. Pertahankan transaksi/claim bersyarat.
- PDF PPJ hanya setelah approval; admin/KUPT pengelola dan QC sesuai wilayah dapat mengunduh draft.
- Scope read admin/KUPT berdasarkan managerId; QC berdasarkan stasiun wilayah. Jangan menyamakan hak akses seluruh role.
- Navigasi/header/urutan stasiun yang ada harus dipertahankan ketika refactor.

## Sumber kebenaran
- `shared/stations.ts`: katalog stasiun dan subset penugasan/guest yang sengaja berbeda. Frontend re-export melalui lib/stations.ts.
- `shared/geo.ts`, `shared/display.ts`, `shared/route.ts`, `shared/priorityQueue.ts`: util murni lintas modul.
- `ppj-kai-backend/prisma/schema.prisma`: model database.
- `ppj-kai-backend/src/app.ts`: aplikasi HTTP yang dapat dites; index.ts hanya startup server/scheduler.
- Controller terpisah: account, assignment, monitoring, import, kategori, auth, tracking, laporan, tugas, mapLocation, trainSchedule, railway, loginPhoto. admin.controller.ts adalah barrel kompatibilitas.
- `src/lib/accessScope.ts` backend: scope hak akses dan parsing wilayah.
- `src/lib/reportSeverity.ts`: kategori `color=error` berarti darurat; key lama emergency/berat hanya fallback jika tidak lagi memiliki konfigurasi kategori.
- Key kategori dan jenis laporan maksimum 50 karakter; foto laporan LongText. Penghapusan kategori bersifat hard-delete; laporan lama tetap menyimpan key.
- `frontend/src/components/admin/`: tampilan akun/pengaturan dan dialog dipisahkan dari halaman.
- Tracking memakai hooks/useGPS.ts dan useCamera.ts. Stream wajib berhenti pada close/unmount dan hasil izin terlambat.
- Route lama yang panjang diterima sampai batas input, lalu disimpan maksimal 20.000 titik dengan endpoint tetap utuh. Jangan menolak shift panjang hanya karena jumlah callback GPS.

## Kompatibilitas yang harus dijaga
- Normalisasi resolveTugasStatus tetap ada pada backend dan frontend untuk data/deployment lama.
- public/sw.js adalah worker pembersih instalasi PWA lama; jangan hapus hanya karena tidak ada registrasi baru.
- Proxy railway tetap mempunyai fallback tiga mirror. Cache hasil non-empty dan deduplikasi request yang masih berjalan; jangan mengganti jalur rel dengan garis lurus tanpa kebutuhan produk.
- AdminMap menampilkan rute dan posisi, bukan input titik. Pemilihan titik tugas memakai dropdown stasiun/titik MAP; menu MAP memiliki peta input tersendiri.
- Endpoint lama `/tugas/summary`, GET `/laporan`, dan `/guest/map-data` masih didukung. Guest map-data memerlukan autentikasi; halaman guest menggunakan geometri stasiun.
- Model TemplatePenugasan/TemplateItem dipertahankan untuk data historis/cleanup, bukan fitur template Excel aktif.
- Aplikasi online-first. Pesan offline hanya menjanjikan jejak GPS lokal; request laporan baru tidak masuk antrean offline. Replay antrean lama hanya boleh ke API yang sama dengan token akun yang sama.
- Komponen PPJ lama, BottomNav, tombol UI scaffold, font Geist, dan salinan root test.tsx/code.html sudah dihapus karena tidak terhubung ke aplikasi.

## Verifikasi
- Root: `npm run verify` menjalankan unit test kedua modul, typecheck, lint dan build.
- Backend: `npm test`, `npm run typecheck`.
- Frontend: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Integrasi: buat database MySQL lokal terpisah bernama ppj_audit*, set DATABASE_URL dan AUDIT_DATABASE_URL ke database tersebut, jalankan prisma migrate deploy lalu npm run test:db. Suite menolak URL yang bukan localhost/ppj_audit*.
- Jangan memakai database produksi, menjalankan seeder demo, atau reset database sebagai bagian test.
- Migrasi `20261019120000_complete_legacy_schema` melengkapi riwayat awal dan memperlebar foto/key laporan; tidak menghapus tabel/data. Database lama hasil db push memerlukan pemeriksaan baseline sesuai docs/MIGRATIONS.md.
- GitHub Actions `.github/workflows/verify.yml` menjalankan verifikasi dan integrasi MySQL terpisah.

## Efisiensi pembacaan
- Jangan membaca package-lock.json atau implementasi node_modules; gunakan manifest dan perintah npm untuk inventaris.
- Baca berkas besar per bagian. Jangan membaca tsconfig kecuali terkait konfigurasi/diagnostik TypeScript.
- Pertahankan arity empat parameter error middleware, JWT check akun aktif, dan hash integer 32-bit warna petugas.
