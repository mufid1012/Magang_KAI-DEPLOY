# KAI RailTrack PPJ

Aplikasi web monitoring inspeksi jalur rel untuk PPJ PT Kereta Api Indonesia, dengan pemetaan wilayah DAOP 6 Yogyakarta. Frontend Next.js dan backend Express–Prisma–MySQL dijalankan serta di-deploy secara terpisah.

Dokumentasi ini mengikuti [route aktif](ppj-kai-backend/src/routes), [schema database](ppj-kai-backend/prisma/schema.prisma), dan [halaman frontend](ppj-kai-frontend/src/app).

## Pengguna dan fitur

| Pengguna | Halaman | Kemampuan utama |
| --- | --- | --- |
| Admin | `/admin` | Kelola petugas, tugas manual/Excel, akun, kategori, titik MAP; pantau perjalanan, laporan, dan approve tracking |
| KUPT | `/admin` | Kelola petugas, tugas/import dengan batas wilayah, kategori, serta monitoring |
| QC | `/qc` | Monitoring tugas, posisi, dan laporan menurut wilayah JR |
| PPJ | `/inspeksi` | Tugas/riwayat, GPS tracking, laporan/foto, alert jadwal, warning PPJ, PDF setelah approval |
| Pengunjung | `/guest` | Peta monitoring publik tanpa login |

Role `guest` juga ada pada model pengguna, tetapi halaman guest dan endpoint petanya bersifat publik. Approval, manajemen akun, jadwal kereta, dan titik MAP dibatasi khusus admin oleh router backend. Tugas admin/KUPT dibatasi melalui `managerId` petugas; QC menggunakan `UserWilayah`.

### Kelola akun

Menu Akun admin menyediakan tambah, edit, aktifkan/nonaktifkan, dan **Hapus Permanen** sebagai aksi terpisah. Nonaktifkan mempertahankan data dan dapat dibatalkan dengan mengaktifkan akun kembali.

Hapus Permanen menampilkan konfirmasi nama/NIPP serta dampak penghapusan. Akun beserta penugasan, tracking, laporan/foto, warning, wilayah, template, dan data miliknya dihapus dalam satu transaksi. Petugas yang dikelola akun tersebut dilepas (`managerId = null`), bukan ikut dihapus. Referensi approval dan penerima warning dibersihkan. Penghapusan ditolak untuk akun admin, akun sendiri, atau akun dengan inspeksi aktif. Penghapusan permanen tidak dapat dibatalkan melalui aplikasi.

Token akun yang dihapus atau dinonaktifkan ditolak pada request terproteksi berikutnya. Daftar akun dan data dashboard diperbarui setelah aksi berhasil, disertai notifikasi hasil.

Sidebar admin: **Tugas, Live, Map, Akun, Setting**. Tab **Jadwal Kereta**, tabel, dan form CRUD-nya sudah dihapus karena tidak digunakan lagi. API/database jadwal lama tetap tersedia; tombol warning PPJ tetap digunakan.

### Foto halaman login

Super Admin (role `admin`) dapat membuka **Setting → Foto Halaman Login** untuk menambah, melihat, mengedit judul/mengganti file, menghapus, menentukan urutan, dan mengaktifkan/nonaktifkan foto. Unggahan mendukung PNG/JPG maksimal 5 MB dan 40 megapiksel, dengan pemeriksaan isi dan decoding gambar di backend. Foto disimpan di MySQL sehingga tetap tersedia setelah restart backend dan tidak bergantung pada folder upload lokal.

Panel kiri login desktop menampilkan foto aktif menurut urutan, berganti setiap 6 detik, dan menyediakan tombol pemilih foto. Preferensi reduced motion menonaktifkan pergantian otomatis. Jika semua foto dihapus/nonaktif, gambar bawaan `/cc206.png` digunakan; login tetap dapat dipakai saat layanan foto gagal. Tata letak login mobile tetap menggunakan form dan logo.

API publik: `GET /api/login-photos` (metadata foto aktif) dan `GET /api/login-photos/:id/image` (gambar; termasuk foto nonaktif untuk pratinjau admin). Foto login merupakan aset publik. CRUD khusus admin tersedia pada `/api/admin/login-photos` dengan `GET`, `POST`, `PATCH /:id`, dan `DELETE /:id`. POST/PATCH memakai multipart field `title`, `sortOrder`, `isActive`, dan file `photo`; file wajib saat tambah, opsional saat edit.

Deployment: jalankan `npx prisma generate` dan migrasi `20261014120000_add_login_photos`. Untuk instalasi lama yang memakai `db push`, endpoint membuat tabel `login_photos` secara idempoten seperti fitur MAP. Pengujian regresi tersedia melalui `npm test` di backend, termasuk HTTP/JWT, CRUD, unggahan, dan hak akses foto login.

### Penugasan dan inspeksi

- Form penugasan menggunakan dropdown stasiun; admin juga dapat memilih titik MAP miliknya. Tambah/hapus tugas menampilkan notifikasi hasil.
- Daftar tugas menyediakan pencarian, filter status, rentang tanggal, serta detail inspeksi.
- Alur PPJ: `/inspeksi` → `/inspeksi/[id]` → `/inspeksi/[id]/selesai`.
- Tracking menyediakan GPS, foto awal/akhir, timer, lintasan rel, dan laporan temuan dengan foto/koordinat. Posisi aktif disinkronkan setiap 15 detik.
- Sesi/lintasan disimpan di `localStorage`; waktu mulai backend dipakai untuk pemulihan timer.
- UI menerapkan radius 500 meter pada titik awal/akhir. Backend memvalidasi jendela mulai satu jam sebelum sampai satu jam sesudah `jamMulai` dalam WIB. Tugas tanpa jam mulai melewati pemeriksaan waktu tersebut.

| Status tugas | Arti |
| --- | --- |
| `pending` | Belum dimulai |
| `in_progress` | Tracking aktif |
| `need_approval` | Inspeksi dihentikan, menunggu approval |
| `completed` | Selesai setelah approval |
| `missed` | Melewati jendela mulai |
| `cancelled` | Dibatalkan |

Scheduler berjalan saat backend mulai dan setiap lima menit: tugas pending **hari ini** yang melewati satu jam setelah jam mulai ditandai missed. Scheduler berada dalam proses backend.

Tugas menunggu approval tampil pada tab Riwayat PPJ. Backend/frontend menormalisasi status dari tracking terbaru, termasuk data lama berstatus completed tetapi belum approved. Status tracking (`started/stopped`), approval (`not_approved/approved`), dan keselamatan (`aman/tidak_aman`) disimpan terpisah.

### Approval, kategori, dan PDF

Admin meninjau dan menyetujui tracking. PDF memuat informasi tugas/petugas, waktu, temuan, foto, peta, approval, dan keselamatan. PPJ mengunduh laporan miliknya setelah approval; admin/KUPT pengelola dan QC sesuai wilayah dapat mengakses draft.

Kategori temuan diambil dari database, dapat ditambah, diubah, dinonaktifkan, dan diurutkan. Kategori bertingkat/berwarna `error` memicu sirine darurat; kategori lain tetap tercatat tanpa sirine darurat. Preferensi suara sirine disimpan melalui profil pengguna.

### Alert jadwal dan tombol ALERT KERETA

Dua sumber notifikasi memiliki alur berbeda:

1. **Jadwal kereta (legacy):** tab pengelolaan jadwal di admin sudah dihapus. API dan data jadwal tetap tersedia; polling PPJ setiap 30 detik masih berjalan saat tracking aktif sehingga jadwal aktif yang sudah tersimpan masih dapat memicu alert. Backend memilih rentang berangkat–tiba WIB, termasuk perjalanan melewati tengah malam. Ini bukan posisi kereta langsung dan belum difilter menurut rute PPJ.
2. **Warning PPJ:** tombol ALERT KERETA mengirim warning ke maksimal dua sesi PPJ terdekat, satu pada setiap sisi proyeksi jalur. Pengirim/penerima harus tracking aktif pada pasangan stasiun yang sama (termasuk arah terbalik), GPS penerima maksimal dua menit terakhir. Tidak ada batas radius jarak. Cooldown pengiriman 30 detik, masa berlaku dua menit, polling penerima setiap 10 detik.

Warning menyimpan snapshot stasiun tugas pengirim. Arah datang kereta berasal dari **tujuan akhir PPJ pengirim**, melalui `trainDirectionName` dengan fallback frontend `endPointName`. Untuk Rusniawan bertugas Yogyakarta → Lempuyangan, teks dan suara:

> Warning dari Rusniawan. Ada kereta akan lewat dari arah Sta. Lempuyangan.

Nama arah tidak ditentukan dari tujuan tugas penerima. Endpoint terbaru tidak menampilkan warning lama tanpa informasi rute.

### Import Excel

Unduh template melalui dashboard, isi sheet pertama **Template Penugasan**, lalu unggah melalui Import Excel. UI hanya menerima `.xlsx`; backend membatasi file 5 MB dengan field multipart `file`.

| Urutan | Kolom | Isi |
| --- | --- | --- |
| 1 | NIPP Petugas | NIPP PPJ aktif |
| 2 | Nama Petugas | Referensi; pencocokan tetap melalui NIPP |
| 3 | Titik Awal | Nama stasiun/titik tersedia |
| 4 | Titik Akhir | Berbeda dari titik awal |
| 5 | Tanggal (YYYY-MM-DD) | Contoh `2026-09-22` atau sel tanggal Excel |
| 6 | Jam Mulai (HH:mm) | Contoh `08:00`; opsional |
| 7 | Jam Selesai (HH:mm) | Contoh `16:00`; opsional |

Pertahankan urutan kolom karena backend membaca berdasarkan posisi. Template menyediakan sheet referensi **Daftar Titik Pengecekan** dan **Daftar Petugas**. Ganti/hapus baris contoh bila tidak digunakan karena ikut diproses.

- Banyak baris diproses dengan hasil total, berhasil, gagal, dan detail nomor baris. Baris kosong dilewati; baris valid tetap disimpan meskipun baris lain gagal.
- NIPP mengabaikan kapital/spasi; pencocokan titik menoleransi tanda baca dan typo kecil yang tidak ambigu.
- PPJ aktif tanpa pengelola otomatis dikaitkan setelah baris valid berhasil. PPJ milik pengelola lain tidak diambil alih.
- Admin bisa mengimpor titik MAP miliknya; KUPT dibatasi stasiun wilayahnya.
- Jam backend dinormalisasi ke `HH:mm`: serial waktu Excel, teks `08:00`, `08.00`, `08:00 WIB`, angka `8/800`, serta serial tanggal+jam berpecahan. Utamakan `HH:mm` atau sel waktu Excel untuk menghindari ambiguitas angka.
- Frontend juga mengonversi sel jam numerik sebelum upload untuk kompatibilitas backend lama.
- Belum ada deduplikasi import. Saat mengulang, unggah hanya baris gagal agar tugas berhasil tidak terduplikasi.

Endpoint aktif: `/api/admin/tugas/template` dan `/api/admin/tugas/import`, di `admin.controller.ts`. Implementasi lama dalam `import.controller.ts` tidak terpasang pada router aktif.

### Peta dan pemulihan sesi

Leaflet menampilkan tile OpenStreetMap. Geometri rel diambil melalui proxy Overpass dengan server cadangan; frontend menggunakan graph/Dijkstra untuk jalur rel. Lintasan tracking diproyeksikan ke geometri tersedia. Warna petugas konsisten berdasarkan NIPP.

Menu MAP admin menyediakan marker stasiun, titik custom, tabel pencarian, input koordinat, klik/geser marker, dan pencarian alamat melalui proxy geocoding. Form penugasan memakai dropdown titik. Isolasi layer peta mencegah Leaflet menutupi modal/tombol.

Tracking aktif tetap mengirim request API secara online. State perjalanan disimpan di `localStorage` dan dipulihkan dari endpoint active-tracking. Service worker PWA lama sudah dilepas; `public/sw.js` hanya membersihkan cache instalasi lama agar bundle usang tidak tetap digunakan.

## Teknologi dan struktur

| Modul | Teknologi |
| --- | --- |
| Frontend | Next.js 16.3.6, React 19, TypeScript 5, TailwindCSS 3.4, Leaflet 1.9, Axios, idb |
| Backend | Express 5, TypeScript 6, Prisma/Client 5.20, MySQL, JWT, bcryptjs, multer, SheetJS, pdfmake, canvas |

Lihat `package.json` masing-masing modul untuk rentang versi dan lockfile untuk instalasi reproducible.

```text
Magang_KAI-DEPLOY/
├── README.md
├── AGENTS.md                       # Referensi pengembangan untuk agent
├── ppj-kai-backend/
│   ├── prisma/schema.prisma        # Sumber schema
│   ├── prisma/migrations/          # Riwayat SQL yang tersedia
│   ├── seed-user.ts                # Wilayah, akun demo, tugas contoh
│   ├── seed-kategori.ts            # Kategori default
│   └── src/
│       ├── index.ts                # API, CORS, health, scheduler
│       ├── controllers/            # Auth, tugas, tracking, admin, PDF, peta
│       ├── routes/                 # Endpoint aktif
│       ├── middleware/             # JWT/role
│       ├── lib/                    # Scheduler, static map, tabel MAP
│       └── utils/                  # Import, status, penerima warning
└── ppj-kai-frontend/
    ├── next.config.mjs             # Konfigurasi Next.js
    ├── public/                     # Manifest, ikon, service worker
    └── src/
        ├── app/                    # login/admin/qc/guest/inspeksi
        ├── components/             # Peta, modal, auth guard, layout
        ├── hooks/                  # Sinkronisasi offline
        └── lib/                    # API, audio, toast, stasiun, rel, offline
```

Model utama: `User → TugasPpj → Tracking → Laporan`. Model pendukung: `Wilayah`, `UserWilayah`, `MapLocation`, `KategoriTemuan`, `TrainSchedule`, dan `WarningAlert`. `TemplatePenugasan/TemplateItem` ada dalam schema tetapi belum memiliki route aktif.

## Instalasi lokal

Siapkan Node.js yang kompatibel dengan dependensi, npm, dan MySQL 8. Repository belum menetapkan versi Node melalui engines/.nvmrc; samakan dengan lingkungan deployment. GPS/kamera membutuhkan HTTPS atau localhost. `canvas` dapat memerlukan library native bila binary prabuilt tidak tersedia.

```bash
git clone https://github.com/mufid1012/Magang_KAI-DEPLOY.git
cd Magang_KAI-DEPLOY
```

Package root menyediakan `npm run verify` untuk test, typecheck, lint, dan build kedua modul. Jalankan aplikasi development dari modul masing-masing.

### Backend dan database development baru

Buat database MySQL `ppjkai` beserta pengguna yang sesuai, lalu buat `ppj-kai-backend/.env`:

```dotenv
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/ppjkai"
PORT=5001
JWT_SECRET="ganti-dengan-secret-acak-yang-kuat"
FRONTEND_URL="http://localhost:3000"
APP_URL="http://localhost:3000"
TRACKING_BYPASS_ENABLED=false
NODE_ENV=development
```

```bash
cd ppj-kai-backend
npm ci
npx prisma migrate deploy
npx prisma generate
npx tsx seed-user.ts
npx tsx seed-kategori.ts
npm run dev
```

`db push` di sini ditujukan untuk database development baru. Seeder akun **memperbarui password akun demo yang sudah ada** beserta beberapa data penugasannya; jangan jalankan otomatis saat startup production. Seeder kategori mempertahankan konfigurasi kategori yang sudah ada.

### Frontend

Buat `ppj-kai-frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL="http://localhost:5001/api"
NEXT_PUBLIC_TRACKING_BYPASS_ENABLED=false
```

Di terminal kedua, dari root repository:

```bash
cd ppj-kai-frontend
npm ci
npm run dev
```

Frontend: `http://localhost:3000`. Backend: `http://localhost:5001`. `GET /api/health` memeriksa koneksi database.

### Akun demo

| Role | NIPP | Password |
| --- | --- | --- |
| Admin | `ADMIN-001` | `admin123` |
| QC Region A/B/C | `QC-A001`, `QC-B001`, `QC-C001` | `qc123` |
| KUPT Jenar | `KUPT-001` | `kupt123` |
| PPJ | `KAI-1234` | `password123` |

Akun ini untuk pengembangan. Seeder membuat wilayah JR 6.1–6.13 dan tugas contoh bila petugas demo belum memiliki tugas. Guest tidak membutuhkan akun.

## Konfigurasi

| Modul | Variabel | Perilaku/default |
| --- | --- | --- |
| Backend | `DATABASE_URL` | Koneksi MySQL Prisma |
| Backend | `PORT` | Default 5001 |
| Backend | `JWT_SECRET` | Wajib, minimal 32 karakter acak; server menolak start jika tidak valid |
| Backend | `FRONTEND_URL` | Wajib di production; allowlist origin, pisahkan beberapa origin dengan koma |
| Backend | `APP_URL` | Referer geocoding; default localhost |
| Backend | `GEOCODING_API_URL` | Opsional; default pencarian Nominatim OpenStreetMap |
| Backend | `TRACKING_BYPASS_ENABLED` | Bypass tersedia kecuali flag bernilai `false`; request harus mengirim `bypassMode: true` |
| Frontend | `NEXT_PUBLIC_API_URL` | URL backend berakhiran `/api`; default localhost:5001/api |
| Frontend | `NEXT_PUBLIC_TRACKING_BYPASS_ENABLED` | Toggle bypass tersedia kecuali flag bernilai `false` |
| Keduanya | `NODE_ENV` | Development/production; memengaruhi validasi konfigurasi dan rincian error |

Mode bypass **tidak terbatas localhost** dan tersedia bila flag tidak diisi. UI dapat melewati pembatasan GPS/geofence/foto/jadwal untuk pengujian; backend mempunyai pemeriksaan bypass jadwal sendiri. Matikan kedua flag untuk pemakaian normal. Mode normal juga divalidasi geofence/foto di server; request bypass yang diizinkan melewati pemeriksaan tersebut.

`NEXT_PUBLIC_*` dibaca saat build; perubahan URL atau flag frontend membutuhkan rebuild/redeploy.

## API aktif

Base path `/api`. Endpoint terproteksi memakai `Authorization: Bearer <token>`. JWT berisi id/role dengan masa berlaku satu hari. Middleware memeriksa keberadaan/status aktif akun dan memakai role terbaru dari database pada setiap request. Tabel menunjukkan middleware; controller dapat menambahkan pembatasan kepemilikan/wilayah. Respons umumnya `{ success, data, message }`; PDF/template berupa file.

### Publik dan profil

| Method | Path | Akses/fungsi |
| --- | --- | --- |
| GET | `/health` | Publik, cek database |
| POST | `/auth/login` | Publik dan dibatasi rate limiter |
| POST/PATCH | `/admin/users`, `/admin/users/:id` | Hanya Super Admin (`admin`) untuk membuat/mengubah akun |
| GET | `/auth/me` | JWT, profil |
| PATCH | `/auth/profile` | JWT, profil termasuk suara sirine |
| GET | `/kategori-temuan` | Publik, kategori aktif |
| GET | `/guest/map-data` | Publik, peta |
| POST | `/railway/geometry` | Publik, proxy rel |

### Inspeksi dan laporan

| Method | Path | Akses/fungsi |
| --- | --- | --- |
| GET | `/tugas`, `/tugas/summary`, `/tugas/:id` | JWT, daftar/ringkasan/detail |
| GET | `/tugas/:id/report` | JWT, PDF menurut kepemilikan/wilayah/approval |
| GET | `/tracking/active/:tugasId` | JWT, sesi aktif |
| POST | `/tracking/start/:tugasId`, `/tracking/update/:id`, `/tracking/stop/:id` | JWT, mulai/update/selesai |
| GET | `/tracking/train-alerts` | PPJ, jadwal aktif |
| POST | `/tracking/warnings` | PPJ; body tugasId, lat, lng |
| GET | `/tracking/warnings/nearby` | PPJ; query tugasId, lat, lng |
| GET, POST | `/laporan` | JWT, baca/kirim laporan |

### Dashboard

| Method | Path | Role middleware |
| --- | --- | --- |
| GET | `/admin/stats`, `/admin/petugas`, `/admin/tugas`, `/admin/emergency`, `/admin/live-positions` | Admin, QC, KUPT |
| GET | `/admin/petugas/available` | Admin, KUPT |
| POST | `/admin/petugas/add`, `/admin/petugas/remove`, `/admin/tugas` | Admin, KUPT |
| DELETE | `/admin/tugas/:id` | Admin, KUPT |
| GET | `/admin/tugas/template` | Admin, KUPT |
| POST | `/admin/tugas/import` | Admin, KUPT |
| POST | `/admin/tracking/:id/approve` | Admin |
| GET | `/admin/kategori-temuan` | Admin, QC, KUPT |
| POST | `/admin/kategori-temuan` | Admin, KUPT |
| PATCH | `/admin/kategori-temuan/reorder`, `/admin/kategori-temuan/:id` | Admin, KUPT |
| DELETE | `/admin/kategori-temuan/:id` | Admin, KUPT |
| GET, POST | `/admin/users` | Admin |
| PATCH | `/admin/users/:id` | Admin; edit atau aktifkan/nonaktifkan lewat `isActive` |
| DELETE | `/admin/users/:id` | Admin; body `{ "confirmPermanent": true }`; hapus permanen akun dan data terkait; 409 jika inspeksi masih aktif |
| GET | `/admin/wilayah` | Admin |
| GET, POST | `/admin/train-schedules` | Admin |
| PATCH, DELETE | `/admin/train-schedules/:id` | Admin |
| GET, POST | `/admin/map-locations` | Admin |
| DELETE | `/admin/map-locations/:id` | Admin |
| GET | `/admin/map-search?q=...` | Admin |

Hapus tugas juga menghapus tracking dan laporan terkait dalam transaksi. Melepas petugas dari daftar kelola tidak menghapus akun.

## Deployment dan database

Deploy sebagai dua layanan. Frontend dapat dibangun di Vercel; backend memerlukan proses Node yang terus berjalan untuk scheduler, misalnya Railway. Koneksi layanan ditentukan oleh `NEXT_PUBLIC_API_URL`, bukan nama repository.

| Layanan | Root directory | Install/build | Start |
| --- | --- | --- | --- |
| Frontend | `ppj-kai-frontend` | `npm ci`, `npm run build` | `npm start` di host Node, atau runtime Next.js host |
| Backend | `ppj-kai-backend` | `npm ci` (postinstall Prisma generate) | `npm start` |

Backend menjalankan TypeScript melalui tsx dan belum memiliki script build. Siapkan database, secret, origin frontend HTTPS, serta matikan bypass. Batas JSON/form adalah 10 MB untuk foto; upload Excel 5 MB.

Verifikasi repository, branch, root directory, dan commit yang digunakan **setiap layanan**. Push/deploy frontend sukses belum membuktikan backend diperbarui. Remote Git lokal tidak membuktikan repository sumber Railway. Health check membuktikan koneksi database, tetapi belum menampilkan versi commit.

### Migrasi database lama

Riwayat schema dilengkapi oleh `20261019120000_complete_legacy_schema`. Instalasi kosong menggunakan seluruh delapan migrasi. Database hasil db push perlu pemeriksaan dan baseline terlebih dahulu; ikuti [panduan migrasi](docs/MIGRATIONS.md). Jangan menjalankan reset/accept-data-loss pada database berisi data.

Mode bypass tetap tersedia untuk testing dengan perilaku flag lama. Mode normal sekarang memvalidasi foto dan geofence di backend. Foto laporan menggunakan LONGTEXT; key kategori/laporan maksimum 50 karakter. Alur approval dan pembatasan unduh PDF tetap berlaku.

## Verifikasi pengembangan

```bash
# Dari ppj-kai-backend
npm test

# Dari ppj-kai-frontend
npm run lint
npm run build
```

Test backend memakai Node test runner + tsx: normalisasi import, status approval, pemilihan penerima/arah warning, serta controller dengan mock Prisma. Test ini bukan pengujian database/browser produksi. Build frontend memeriksa kompilasi dan tipe.

## Troubleshooting

| Gejala | Pemeriksaan |
| --- | --- |
| Import gagal jam_mulai terlalu panjang | Periksa sel waktu, commit backend aktif, dan tipe kolom database; versi baru menormalisasi HH:mm |
| Warning hanya “dari arah” | Periksa endPointName/trainDirectionName pada respons API, snapshot pengirim, deployment, dan kolom warning; uji warning baru |
| Tidak ada penerima warning | Periksa pasangan stasiun, tracking aktif, GPS terbaru, serta keberadaan PPJ lain |
| Tugas admin kosong | Periksa managerId; untuk QC periksa wilayah/nama stasiun |
| PDF PPJ belum tersedia | Periksa approval tracking terbaru; pending approval masuk Riwayat |
| CORS/API ke localhost di production | Periksa NEXT_PUBLIC_API_URL saat build dan FRONTEND_URL backend |
| Tampilan/cache lama | Muat ulang/tutup-buka aplikasi; service worker pembersih akan menghapus cache PWA versi lama |
| GPS/kamera/suara gagal | Periksa HTTPS, izin, dukungan browser, dan interaksi pengguna untuk audio |
| Jalur rel kosong | Periksa koneksi proxy railway/geometry dan Overpass; geometri bergantung data OSM |

## Konteks penggunaan

Proyek dikembangkan untuk kebutuhan prototipe/internal. Repository belum menyertakan berkas LICENSE khusus untuk ketentuan penggunaan seluruh proyek.

## Perbaikan audit 19 Oktober 2026

Lihat [pemetaan temuan dan verifikasi](docs/AUDIT_IMPLEMENTATION.md). Gunakan Node 24 dan `npm ci` di masing-masing modul. Konfigurasi dan dependensi lokal harus mengikuti manifest/lockfile; jangan menggunakan node_modules dari versi aplikasi sebelumnya.

`npm run verify` dari root menjalankan pengujian kedua modul, pemeriksaan tipe, lint dan build frontend. `npm run test:db` dari backend menjalankan integrasi HTTP/MySQL pada database terpisah sesuai docs/MIGRATIONS.md. GitHub Actions menjalankan pemeriksaan yang sama.

Aplikasi tetap online-first: jejak GPS dipulihkan melalui localStorage dan sesi backend; laporan baru membutuhkan jaringan. Endpoint API lama dan model template tersimpan dipertahankan untuk kompatibilitas, bukan dihapus hanya karena tidak dipanggil frontend saat ini.

Dokumentasi fitur kecepatan PPJ: [metode, konfigurasi, migrasi, pengujian, dan batasan perangkat](docs/TELEMETRY.md).
