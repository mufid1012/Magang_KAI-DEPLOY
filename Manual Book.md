# 📘 Manual Book — KAI RailTrack PPJ

> **Sistem Monitoring Inspeksi Jalur Rel Kereta Api**
> PT Kereta Api Indonesia — DAOP 6 Yogyakarta

**Versi Dokumen:** 1.0
**Terakhir Diperbarui:** Oktober 2026

---

## Daftar Isi

1. [Pendahuluan](#1-pendahuluan)
2. [Tech Stack](#2-tech-stack)
3. [Prasyarat Instalasi](#3-prasyarat-instalasi)
4. [Instalasi & Setup](#4-instalasi--setup)
5. [Konfigurasi Environment](#5-konfigurasi-environment)
6. [Struktur Proyek](#6-struktur-proyek)
7. [Struktur Database](#7-struktur-database)
8. [Role & Hak Akses](#8-role--hak-akses)
9. [Akun Demo](#9-akun-demo)
10. [Fitur Utama](#10-fitur-utama)
11. [API Endpoints](#11-api-endpoints)
12. [Deployment Production](#12-deployment-production)
13. [Migrasi Database](#13-migrasi-database)
14. [Pengujian](#14-pengujian)
15. [Troubleshooting](#15-troubleshooting)
16. [Catatan Penting untuk Developer](#16-catatan-penting-untuk-developer)

---

## 1. Pendahuluan

**KAI RailTrack PPJ** adalah aplikasi web untuk monitoring inspeksi jalur rel kereta api yang dikembangkan untuk Penilik Perjalan (PPJ) di lingkungan PT Kereta Api Indonesia, khususnya DAOP 6 Yogyakarta.

Aplikasi ini terdiri dari **2 modul terpisah**:
- **Frontend** — Next.js (client-facing web app)
- **Backend** — Express.js + Prisma ORM + MySQL (REST API server)

### Tujuan Aplikasi

- Mengelola penugasan inspeksi jalur rel kepada petugas PPJ
- Melacak posisi GPS petugas secara real-time selama inspeksi
- Menerima dan mengelola laporan temuan di lapangan (termasuk foto)
- Menyediakan sistem approval dan pembuatan laporan PDF
- Memberikan alert/warning kereta untuk keselamatan petugas
- Menyediakan dashboard monitoring untuk Admin, QC, KUPT, dan Guest

---

## 2. Tech Stack

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| **Frontend** | Next.js, React, TypeScript, TailwindCSS, Leaflet.js, Axios | 16.3.6, 19, 5, 3.4, 1.9 |
| **Backend** | Express, TypeScript, Prisma Client, MySQL, JWT, bcryptjs | 5, 6, 5.20, 8 |
| **Peta** | OpenStreetMap tiles, Overpass API (geometri rel), Leaflet.js | — |
| **Autentikasi** | JWT Bearer Token (jsonwebtoken) | 9.0 |
| **PDF** | pdfmake | 0.3 |
| **Excel** | exceljs | 4.4 |
| **Upload** | multer | 2.4 |
| **Keamanan** | helmet, cors, express-rate-limit, bcryptjs | — |

### Dependensi Backend Penting

```
@prisma/client, bcryptjs, canvas, cors, dotenv, exceljs,
express, express-rate-limit, helmet, jsonwebtoken, multer,
pdfmake, prisma, tsx
```

### Dependensi Frontend Penting

```
next, react, react-dom, axios, leaflet, react-leaflet,
tailwindcss, lucide-react, idb, clsx, shadcn
```

---

## 3. Prasyarat Instalasi

Sebelum memulai, pastikan sistem Anda sudah memiliki:

| Software | Keterangan |
|----------|------------|
| **Node.js** | Versi yang kompatibel dengan dependensi (samakan dengan lingkungan deployment) |
| **npm** | Disertakan bersama Node.js |
| **MySQL 8** | Database server |
| **Git** | Untuk clone repository |

> **Catatan Penting:**
> - Repository belum menetapkan versi Node melalui `engines` atau `.nvmrc`
> - GPS dan kamera membutuhkan **HTTPS** atau **localhost**
> - Library `canvas` (untuk PDF/peta statis) mungkin memerlukan native library jika binary prabuilt tidak tersedia
> - Di Windows, pastikan build tools untuk native modules sudah terinstal

---

## 4. Instalasi & Setup

### 4.1 Clone Repository

```bash
git clone https://github.com/mufid1012/Magang_KAI-DEPLOY.git
cd Magang_KAI-DEPLOY
```

### 4.2 Setup Backend

#### a) Buat Database MySQL

```sql
CREATE DATABASE ppjkai;
CREATE USER 'ppjkai_user'@'localhost' IDENTIFIED BY 'password_anda';
GRANT ALL PRIVILEGES ON ppjkai.* TO 'ppjkai_user'@'localhost';
FLUSH PRIVILEGES;
```

#### b) Buat File Environment

Buat file `ppj-kai-backend/.env` (atau copy dari `.env.example`):

```dotenv
DATABASE_URL="mysql://ppjkai_user:password_anda@localhost:3306/ppjkai"
PORT=5001
JWT_SECRET="ganti-dengan-secret-acak-yang-kuat-minimal-32-karakter"
FRONTEND_URL="http://localhost:3000"
APP_URL="http://localhost:3000"
TRACKING_BYPASS_ENABLED=false
NODE_ENV=development
```

> **Tip - Generate JWT Secret:**
> ```bash
> openssl rand -base64 48
> ```

#### c) Install Dependencies & Setup Database

```bash
cd ppj-kai-backend
npm ci                        # Install dependensi (lebih reproducible dari npm install)
npx prisma db push            # Sinkronisasi schema ke database
npx prisma generate           # Generate Prisma Client
npx tsx seed-user.ts           # Seed wilayah & akun demo
npx tsx seed-kategori.ts       # Seed kategori temuan default
npm run dev                    # Jalankan backend (mode development, port 5001)
```

> **Penting tentang Seeder:**
> - `seed-user.ts` **memperbarui password akun demo yang sudah ada** — jangan jalankan otomatis di production
> - `seed-kategori.ts` **mempertahankan** konfigurasi kategori yang sudah ada (tidak menimpa)
> - Seeder membuat 13 wilayah (JR 6.1 – JR 6.13) dan tugas contoh

### 4.3 Setup Frontend

#### a) Buat File Environment

Buat file `ppj-kai-frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL="http://localhost:5001/api"
NEXT_PUBLIC_TRACKING_BYPASS_ENABLED=false
```

#### b) Install & Jalankan

Buka terminal kedua:

```bash
cd ppj-kai-frontend
npm ci                        # Install dependensi
npm run dev                    # Jalankan frontend (mode development, port 3000)
```

### 4.4 Verifikasi Instalasi

| Layanan | URL | Keterangan |
|---------|-----|------------|
| Frontend | http://localhost:3000 | Halaman login |
| Backend | http://localhost:5001 | Root API response |
| Health Check | http://localhost:5001/api/health | Cek koneksi database |

---

## 5. Konfigurasi Environment

### 5.1 Variabel Backend (`ppj-kai-backend/.env`)

| Variabel | Wajib | Default | Keterangan |
|----------|-------|---------|------------|
| `DATABASE_URL` | Ya | — | Connection string MySQL untuk Prisma |
| `PORT` | Tidak | `5001` | Port backend server |
| `JWT_SECRET` | Ya | — | Secret untuk JWT, **minimal 32 karakter acak**. Server menolak start jika tidak valid |
| `FRONTEND_URL` | Ya (prod) | — | Origin frontend yang diizinkan CORS. Pisahkan beberapa origin dengan **koma** |
| `APP_URL` | Tidak | localhost | Referer untuk proxy geocoding |
| `GEOCODING_API_URL` | Tidak | Nominatim OSM | URL API pencarian alamat |
| `TRACKING_BYPASS_ENABLED` | Tidak | `false` | Bypass validasi jadwal tracking. **Hanya aktif jika bernilai `true`** |
| `NODE_ENV` | Tidak | — | `development` / `production`. Memengaruhi validasi dan rincian error |
| `TRUST_PROXY_HOPS` | Tidak | `0` | Jumlah hop proxy tepercaya (untuk rate limiter di belakang reverse proxy) |

### 5.2 Variabel Frontend (`ppj-kai-frontend/.env.local`)

| Variabel | Wajib | Default | Keterangan |
|----------|-------|---------|------------|
| `NEXT_PUBLIC_API_URL` | Ya | `http://localhost:5001/api` | URL backend API berakhiran `/api` |
| `NEXT_PUBLIC_TRACKING_BYPASS_ENABLED` | Tidak | `false` | Bypass validasi GPS/geofence/foto/jadwal di UI |

> **PENTING:**
> - Variabel `NEXT_PUBLIC_*` dibaca **saat build**. Perubahan URL atau flag frontend membutuhkan **rebuild/redeploy**.
> - Mode bypass **tidak terbatas localhost**. Matikan kedua flag bypass untuk pemakaian normal.
> - Bypass geofence di UI bukan validasi geofence di server.

---

## 6. Struktur Proyek

```
Magang_KAI-DEPLOY/
├── README.md                           # Dokumentasi utama proyek
├── AGENTS.md                           # Referensi untuk AI coding agent
├── Manual Book.md                      # Dokumen ini
│
├── ppj-kai-backend/                    # ═══ BACKEND ═══
│   ├── .env                            # Konfigurasi environment (JANGAN commit)
│   ├── .env.example                    # Template environment
│   ├── package.json                    # Dependensi & scripts
│   ├── tsconfig.json                   # Konfigurasi TypeScript
│   ├── prisma.config.ts                # Konfigurasi Prisma CLI
│   ├── seed-user.ts                    # Seeder: wilayah + akun demo + tugas contoh
│   ├── seed-kategori.ts                # Seeder: kategori temuan default
│   │
│   ├── prisma/
│   │   ├── schema.prisma               # ** SUMBER KEBENARAN struktur database
│   │   ├── seed.ts                     # Prisma seed entry
│   │   └── migrations/                 # Riwayat migrasi SQL
│   │       ├── 20260507225946_init/
│   │       ├── 20260718170000_add_map_locations/
│   │       ├── 20260803120000_add_tracking_approval_train_schedules_warnings/
│   │       ├── 20260910120000_add_warning_route/
│   │       ├── 20260910130000_add_need_approval_task_status/
│   │       ├── 20261013120000_add_warning_recipients/
│   │       └── 20261014120000_add_login_photos/
│   │
│   └── src/
│       ├── index.ts                    # ** Entry point: Express app, CORS, routes, scheduler
│       │
│       ├── config/
│       │   ├── database.ts             # Prisma client singleton
│       │   └── env.ts                  # Validasi & parsing environment
│       │
│       ├── middleware/
│       │   ├── auth.middleware.ts       # requireAuth (JWT), requireRole (role check)
│       │   ├── auth.test.ts            # Test middleware autentikasi
│       │   └── rateLimiter.ts          # Rate limiter untuk login
│       │
│       ├── controllers/
│       │   ├── auth.controller.ts      # Login, getMe, updateProfile
│       │   ├── admin.controller.ts     # ** CRUD users, tugas, kategori, stats, import Excel
│       │   ├── tugas.controller.ts     # Daftar/detail tugas petugas, PDF report
│       │   ├── tracking.controller.ts  # Start/update/stop tracking, train alerts, warnings
│       │   ├── laporan.controller.ts   # CRUD laporan temuan
│       │   ├── guest.controller.ts     # Endpoint publik peta & stats
│       │   ├── loginPhoto.controller.ts # CRUD foto halaman login
│       │   ├── mapLocation.controller.ts # Kelola titik MAP custom
│       │   ├── railway.controller.ts   # Proxy geometri rel Overpass
│       │   └── trainSchedule.controller.ts # CRUD jadwal kereta
│       │
│       ├── routes/
│       │   ├── auth.routes.ts          # /api/auth/*
│       │   ├── admin.routes.ts         # /api/admin/* (auth + role)
│       │   ├── tugas.routes.ts         # /api/tugas/* (auth)
│       │   ├── tracking.routes.ts      # /api/tracking/* (auth)
│       │   ├── laporan.routes.ts       # /api/laporan/* (auth)
│       │   ├── guest.routes.ts         # /api/guest/*
│       │   ├── railway.routes.ts       # /api/railway/*
│       │   └── loginPhoto.routes.ts    # /api/login-photos/*
│       │
│       ├── lib/
│       │   ├── scheduler.ts            # Auto-missed task scheduler (setiap 5 menit)
│       │   ├── staticMap.ts            # Generate peta statis untuk PDF
│       │   ├── mapLocationsTable.ts    # Inisialisasi tabel map_locations
│       │   └── loginPhotosTable.ts     # Inisialisasi tabel login_photos
│       │
│       └── utils/
│           ├── jwt.ts                  # Helper JWT sign/verify
│           ├── importMatching.ts       # Logika pencocokan import Excel
│           ├── tugasStatus.ts          # Normalisasi status tugas
│           └── warningRoute.ts         # Logika penerima warning PPJ
│
├── ppj-kai-frontend/                   # ═══ FRONTEND ═══
│   ├── package.json                    # Dependensi & scripts
│   ├── next.config.mjs                 # Konfigurasi Next.js
│   ├── tailwind.config.ts              # Konfigurasi TailwindCSS
│   ├── postcss.config.mjs              # Konfigurasi PostCSS
│   ├── components.json                 # Konfigurasi Shadcn UI
│   │
│   ├── public/
│   │   ├── manifest.json               # PWA manifest
│   │   ├── sw.js                       # Service worker (pembersih cache lama)
│   │   └── cc206.png                   # Fallback gambar login
│   │
│   └── src/
│       ├── app/
│       │   ├── layout.tsx              # Root layout (Google Fonts Outfit, Material Symbols)
│       │   ├── page.tsx                # Landing -> redirect ke /login
│       │   ├── globals.css             # ** Design tokens Material Design 3
│       │   ├── login/page.tsx          # Login form (NIPP + password)
│       │   ├── admin/page.tsx          # ** Dashboard Admin (Tugas, Live, Map, Akun, Setting)
│       │   ├── qc/page.tsx             # Dashboard QC (monitoring per wilayah)
│       │   ├── guest/page.tsx          # Dashboard Guest (live view publik)
│       │   └── inspeksi/
│       │       ├── page.tsx            # Pemilih tugas PPJ
│       │       ├── [id]/page.tsx       # ** Halaman tracking GPS + peta + kamera
│       │       └── [id]/selesai/page.tsx # Ringkasan setelah inspeksi
│       │
│       ├── components/
│       │   ├── admin/                  # Komponen khusus admin (LoginPhotoSettings, dll.)
│       │   ├── map/
│       │   │   ├── AdminMap.tsx         # Peta admin/QC (route tugas, emergency markers)
│       │   │   ├── DynamicMap.tsx       # Peta tracking PPJ (GPS, track path)
│       │   │   └── GuestMap.tsx         # Peta live view guest
│       │   ├── ppj/
│       │   │   ├── DetailModal.tsx      # Modal detail laporan
│       │   │   ├── TabHistory.tsx       # Tab riwayat PPJ
│       │   │   ├── TabPenjadwalan.tsx   # Tab penugasan (manual & import Excel)
│       │   │   └── TabTracking.tsx      # Tab tracking aktif
│       │   ├── common/
│       │   │   ├── AuthGuard.tsx        # Proteksi route berdasarkan role
│       │   │   └── LoginPhotoSlideshow.tsx # Slideshow foto login
│       │   ├── layout/
│       │   │   └── BottomNav.tsx        # Navigasi bawah (item Track saja)
│       │   └── ui/                     # Komponen UI dasar (Shadcn)
│       │
│       ├── hooks/
│       │   └── (sinkronisasi offline)
│       │
│       └── lib/
│           ├── api.ts                  # ** Axios instance, auto-attach JWT
│           ├── railway.ts             # ** Overpass API + Dijkstra route (3 failover server)
│           ├── stations.ts            # Data koordinat stasiun
│           ├── audio.ts               # Manajemen suara sirine & alert
│           ├── toast.ts               # Notifikasi toast
│           ├── confirm.ts             # Dialog konfirmasi
│           ├── loginPhotos.ts         # Helper foto login
│           ├── tugasStatus.ts         # Normalisasi status tugas (frontend)
│           ├── offline-store.ts       # IndexedDB untuk data offline
│           └── utils.ts               # Helper umum (cn())
```

---

## 7. Struktur Database

Database menggunakan **MySQL 8** dengan ORM **Prisma**. File sumber kebenaran: `ppj-kai-backend/prisma/schema.prisma`.

### 7.1 Diagram Relasi (ERD)

```
┌──────────────────┐
│      users       │
│──────────────────│
│ id (PK)          │◄─────────────────────────────────┐
│ nipp (unique)    │        ┌──────────────────┐       │
│ nama             │        │    tugas_ppj     │       │
│ password         │        │──────────────────│       │
│ role             │        │ id (PK)          │       │
│ is_active        │    ┌──>│ assigned_to (FK) │───────┘
│ manager_id (FK)──│────┘   │ jalur            │
│ alert_sound      │        │ tanggal          │
│ jabatan, phone.. │        │ start/end coords │
└──────┬───────────┘        │ jam_mulai/selesai│
       │                    │ status           │
       │                    └───────┬──────────┘
       │                            │
       │    ┌───────────────────────┘
       │    │
       │    v
       │   ┌──────────────────┐
       │   │    tracking      │
       │   │──────────────────│
       │   │ id (PK)          │◄──────────────────┐
       │   │ tugas_id (FK)    │                    │
       │   │ start/end time   │   ┌────────────┐   │
       │   │ start/end coords │   │  laporan    │   │
       │   │ route_path (JSON)│   │────────────│   │
       │   │ foto_awal/selesai│   │ id (PK)    │   │
       │   │ approval_status  │   │ tracking_id│───┘
       │   │ safety_status    │   │ jenis_temuan│
       │   │ approved_by (FK)─│   │ deskripsi  │
       │   └──────────────────┘   │ foto       │
       │                          │ lat/lng    │
       │                          └────────────┘
       │
       ├──> map_locations        (titik MAP custom admin)
       ├──> train_schedules      (jadwal kereta)
       ├──> warning_alerts       (warning PPJ)
       └──> user_wilayah <────── wilayah (pembagian wilayah JR)

Tabel lain:
  - kategori_temuan      (kategori dinamis temuan)
  - warning_recipients   (penerima warning)
  - login_photos         (foto halaman login)
  - template_penugasan   (template tugas, belum aktif)
  - template_item        (item template, belum aktif)
```

### 7.2 Detail Setiap Tabel

#### `users`

Tabel pengguna utama. Semua role disimpan dalam satu tabel.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID unik |
| `nipp` | VARCHAR(20), Unique | Nomor Induk Pegawai |
| `nama` | VARCHAR(100) | Nama lengkap |
| `password` | VARCHAR(255) | Hash bcrypt |
| `foto` | TEXT, nullable | Foto profil (base64) |
| `role` | VARCHAR(20), default `ppj` | `admin` \| `qc` \| `kupt` \| `guest` \| `ppj` |
| `jabatan` | VARCHAR(100), nullable | Jabatan |
| `division` | VARCHAR(100), nullable | Divisi |
| `work_area` | VARCHAR(100), nullable | Area kerja |
| `phone` | VARCHAR(30), nullable | Nomor telepon |
| `alert_sound` | VARCHAR(20), nullable | Preferensi suara sirine: `siren` \| `beep` \| `chime` \| `off` |
| `is_active` | BOOLEAN, default `true` | Status aktif akun |
| `manager_id` | INT, nullable, FK → `users.id` | Admin/KUPT yang mengelola petugas ini |
| `created_at` | DATETIME | Waktu dibuat |
| `updated_at` | DATETIME | Waktu diperbarui |

**Relasi:**
- Self-relation: `manager` <-> `petugasManaged` (satu admin mengelola banyak petugas)
- One-to-many: -> `tugas_ppj`, `map_locations`, `train_schedules`, `warning_alerts`
- Many-to-many via `user_wilayah`: -> `wilayah`

#### `tugas_ppj`

Tabel penugasan inspeksi jalur.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID tugas |
| `jalur` | VARCHAR(200) | Nama jalur (contoh: "Sta. Jenar -> Sta. Wojo") |
| `tanggal` | DATE | Tanggal penugasan |
| `start_point_lat` | FLOAT | Latitude titik awal |
| `start_point_long` | FLOAT | Longitude titik awal |
| `end_point_lat` | FLOAT | Latitude titik akhir |
| `end_point_long` | FLOAT | Longitude titik akhir |
| `start_point_name` | VARCHAR(200), nullable | Nama titik awal |
| `end_point_name` | VARCHAR(200), nullable | Nama titik akhir |
| `jam_mulai` | VARCHAR(10), nullable | Jam mulai tugas (format `HH:mm`) |
| `jam_selesai` | VARCHAR(10), nullable | Jam selesai tugas (format `HH:mm`) |
| `assigned_to` | INT, FK → `users.id` | Petugas yang ditugaskan |
| `status` | VARCHAR(20), default `pending` | Status tugas (lihat tabel di bawah) |

**Status Tugas:**

| Status | Arti |
|--------|------|
| `pending` | Belum dimulai |
| `in_progress` | Tracking aktif |
| `need_approval` | Inspeksi selesai, menunggu approval admin |
| `completed` | Selesai setelah di-approve |
| `missed` | Melewati jendela waktu mulai |
| `cancelled` | Dibatalkan |

#### `tracking`

Sesi pelacakan GPS selama inspeksi.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID tracking |
| `tugas_id` | INT, FK → `tugas_ppj.id` | Tugas terkait |
| `start_time` | DATETIME, nullable | Waktu mulai tracking |
| `end_time` | DATETIME, nullable | Waktu selesai tracking |
| `start_lat/long` | FLOAT, nullable | Koordinat awal |
| `end_lat/long` | FLOAT, nullable | Koordinat akhir |
| `durasi` | INT, nullable | Durasi dalam detik |
| `status` | VARCHAR(20), default `started` | `started` \| `stopped` |
| `foto_awal` | LONGTEXT, nullable | Foto saat mulai (base64) |
| `foto_selesai` | LONGTEXT, nullable | Foto saat selesai (base64) |
| `route_path` | LONGTEXT, nullable | Lintasan JSON: `[[lat,lng], ...]` |
| `approval_status` | VARCHAR(20), default `not_approved` | `not_approved` \| `approved` |
| `safety_status` | VARCHAR(20), default `aman` | `aman` \| `tidak_aman` |
| `approved_at` | DATETIME, nullable | Waktu approval |
| `approved_by` | INT, nullable, FK → `users.id` | Admin yang meng-approve |

#### `laporan`

Laporan temuan selama inspeksi.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID laporan |
| `tracking_id` | INT, FK → `tracking.id` | Sesi tracking terkait |
| `jenis_temuan` | VARCHAR(20) | Key kategori temuan |
| `deskripsi` | TEXT | Deskripsi temuan |
| `foto` | TEXT, nullable | Foto temuan (base64) |
| `latitude` | FLOAT | Latitude lokasi temuan |
| `longitude` | FLOAT | Longitude lokasi temuan |
| `created_at` | DATETIME | Waktu laporan |

#### `wilayah`

Pembagian wilayah DAOP 6 (JR = Juru Rel).

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID wilayah |
| `kode` | VARCHAR(20), Unique | Kode wilayah (contoh: `JR 6.1`) |
| `nama` | VARCHAR(100) | Nama wilayah (contoh: `Jenar`) |
| `stations` | TEXT | JSON array nama stasiun |

**Data Wilayah Tersedia (dari seeder):**

| Kode | Nama | Stasiun |
|------|------|---------|
| JR 6.1 | Jenar | Sta. Jenar |
| JR 6.2 | Wojo | Sta. Wojo |
| JR 6.3 | Wates | Sta. Wates |
| JR 6.4 | Yogyakarta | Sta. Yogyakarta, Sta. Lempuyangan, Sta. Maguwo, Sta. Patukan |
| JR 6.5 | Brambanan | Sta. Brambanan |
| JR 6.6 | Klaten | Sta. Klaten |
| JR 6.7 | Delanggu | Sta. Delanggu |
| JR 6.8 | Solobalapan | Sta. Solo Balapan |
| JR 6.9 | Wonogiri | Sta. Wonogiri |
| JR 6.10 | Sumberlawang | Sta. Sumberlawang |
| JR 6.11 | Palur | Sta. Palur |
| JR 6.12 | Sragen | Sta. Sragen |
| JR 6.13 | Palur | Sta. Palur |

#### `user_wilayah`

Tabel penghubung many-to-many antara pengguna (QC/KUPT) dan wilayah.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID |
| `user_id` | INT, FK → `users.id` | ID pengguna |
| `wilayah_id` | INT, FK → `wilayah.id` | ID wilayah |

Composite unique: `(user_id, wilayah_id)`.

#### `kategori_temuan`

Kategori temuan yang bersifat **dinamis** (dikelola melalui CRUD admin).

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID |
| `key` | VARCHAR(50), Unique | Identifier (contoh: `kerusakan_rel`) |
| `label` | VARCHAR(100) | Label tampilan (contoh: `Kerusakan Rel`) |
| `icon` | VARCHAR(50) | Material Symbol icon name |
| `color` | VARCHAR(20), default `primary` | Warna. `error` = memicu sirine darurat |
| `is_active` | BOOLEAN, default `true` | Soft delete flag |
| `sort_order` | INT, default `0` | Urutan tampilan |

**Kategori Default (dari seeder):**

| Key | Label | Color | Efek |
|-----|-------|-------|------|
| `kerusakan_rel` | Kerusakan Rel | `error` | Sirine darurat |
| `gangguan_struktur` | Gangguan Struktur Jalur | `error` | Sirine darurat |
| `anjlokan_kecelakaan` | Anjlokan atau Kecelakaan | `error` | Sirine darurat |
| `lainnya` | Lainnya | `primary` | Tercatat, tanpa sirine |

#### `map_locations`

Titik lokasi custom yang dibuat admin di peta.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID |
| `name` | VARCHAR(150) | Nama lokasi |
| `address` | TEXT, nullable | Alamat |
| `description` | TEXT, nullable | Deskripsi |
| `latitude` | FLOAT | Latitude |
| `longitude` | FLOAT | Longitude |
| `created_by` | INT, FK → `users.id` | Admin pembuat |

#### `train_schedules`

Jadwal kereta api (fitur legacy, tab admin sudah dihapus tapi API tetap tersedia).

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID |
| `train_code` | VARCHAR(30), Unique | Kode kereta |
| `train_name` | VARCHAR(100) | Nama kereta |
| `origin` | VARCHAR(150) | Stasiun asal |
| `destination` | VARCHAR(150) | Stasiun tujuan |
| `departure_time` | VARCHAR(5) | Jam berangkat (HH:mm) |
| `arrival_time` | VARCHAR(5) | Jam tiba (HH:mm) |
| `is_active` | BOOLEAN, default `true` | Status aktif |
| `created_by` | INT, FK → `users.id` | Admin pembuat |

#### `warning_alerts`

Warning kereta yang dikirim antar PPJ.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID |
| `created_by` | INT, FK → `users.id` | PPJ pengirim |
| `latitude` | FLOAT | Koordinat pengirim |
| `longitude` | FLOAT | Koordinat pengirim |
| `start_point_name` | VARCHAR(200), nullable | Snapshot stasiun awal pengirim |
| `end_point_name` | VARCHAR(200), nullable | Snapshot stasiun akhir pengirim |
| `expires_at` | DATETIME | Waktu kedaluwarsa (2 menit) |
| `created_at` | DATETIME | Waktu dibuat |

#### `warning_recipients`

Penerima warning (maks 2 sesi tracking, satu per sisi jalur).

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID |
| `warning_id` | INT, FK → `warning_alerts.id` | Warning terkait |
| `tracking_id` | INT, FK → `tracking.id` | Sesi tracking penerima |

#### `login_photos`

Foto untuk slideshow halaman login.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT, PK, Auto | ID |
| `title` | VARCHAR(150) | Judul foto |
| `image` | LONGBLOB | Data gambar |
| `mime_type` | VARCHAR(30) | Tipe MIME (image/png, image/jpeg) |
| `is_active` | BOOLEAN, default `true` | Aktif/nonaktif |
| `sort_order` | INT, default `0` | Urutan tampilan |

#### `template_penugasan` & `template_item`

Template penugasan (ada di schema tapi **belum memiliki route aktif**).

---

## 8. Role & Hak Akses

Sistem memiliki **5 role** yang menentukan akses fitur:

### 8.1 Admin (`admin`) — Super Admin

| Aspek | Detail |
|-------|--------|
| **Halaman** | `/admin` |
| **Sidebar** | Tugas, Live, Map, Akun, Setting |
| **Kemampuan** | Akses penuh ke seluruh sistem |

**Detail kemampuan:**
- Kelola semua petugas PPJ (tambah ke kelolaan, lepas)
- Buat tugas inspeksi (manual & import Excel)
- Kelola titik MAP custom di peta
- Monitor live tracking semua petugas kelolaannya
- Approve/reject hasil tracking
- Tentukan status keselamatan (`aman` / `tidak_aman`)
- CRUD akun pengguna (tambah, edit, aktifkan/nonaktifkan, hapus permanen)
- CRUD kategori temuan
- CRUD jadwal kereta (API masih aktif)
- Kelola foto halaman login (Setting)
- Unduh PDF laporan draft dan final
- Lihat laporan darurat / emergency

### 8.2 KUPT (`kupt`)

| Aspek | Detail |
|-------|--------|
| **Halaman** | `/admin` |
| **Batasan** | Hanya wilayah dan petugas yang ditetapkan Super Admin |

**Detail kemampuan:**
- Kelola petugas PPJ dalam kelolaannya
- Buat tugas inspeksi (manual & import Excel, dibatasi stasiun wilayah)
- Monitor live tracking petugas kelolaannya
- CRUD kategori temuan
- Unduh PDF laporan draft
- **Tidak bisa:** approve tracking, kelola akun, kelola foto login, kelola MAP

### 8.3 QC (`qc`)

| Aspek | Detail |
|-------|--------|
| **Halaman** | `/qc` |
| **Batasan** | Hanya wilayah JR yang ditetapkan |

**Detail kemampuan:**
- Monitoring tugas berdasarkan wilayah JR
- Lihat posisi tracking petugas di wilayahnya
- Lihat laporan temuan dan emergency
- Unduh PDF laporan draft
- **Tidak bisa:** buat tugas, kelola petugas, approve

**Pembagian Wilayah QC Default:**
- QC Region A: JR 6.1 – JR 6.4
- QC Region B: JR 6.5 – JR 6.8
- QC Region C: JR 6.9 – JR 6.13

### 8.4 PPJ (`ppj`) — Petugas Inspeksi

| Aspek | Detail |
|-------|--------|
| **Halaman** | `/inspeksi` |
| **Alur** | `/inspeksi` → `/inspeksi/[id]` → `/inspeksi/[id]/selesai` |

**Detail kemampuan:**
- Lihat daftar tugas yang ditugaskan
- Mulai & selesaikan tracking GPS
- Ambil foto awal dan akhir inspeksi
- Kirim laporan temuan (foto + lokasi + deskripsi)
- Terima alert jadwal kereta saat tracking
- Kirim & terima warning kereta ke/dari PPJ lain
- Unduh PDF laporan (setelah di-approve)
- Lihat riwayat inspeksi

### 8.5 Guest (`guest`)

| Aspek | Detail |
|-------|--------|
| **Halaman** | `/guest` |
| **Login** | Tidak diperlukan |

**Detail kemampuan:**
- Lihat peta monitoring publik (live view)
- **Tidak bisa:** manipulasi data apapun

### 8.6 Matriks Hak Akses

| Fitur | Admin | KUPT | QC | PPJ | Guest |
|-------|:-----:|:----:|:--:|:---:|:-----:|
| Buat tugas | Ya | Ya | - | - | - |
| Import Excel | Ya | Ya | - | - | - |
| Kelola petugas | Ya | Ya | - | - | - |
| Kelola akun | Ya | - | - | - | - |
| Approve tracking | Ya | - | - | - | - |
| Live monitoring | Ya | Ya | Ya | - | Ya |
| Tracking GPS | - | - | - | Ya | - |
| Kirim laporan | - | - | - | Ya | - |
| PDF (draft) | Ya | Ya | Ya | - | - |
| PDF (final) | Ya | Ya | Ya | Ya | - |
| CRUD kategori | Ya | Ya | - | - | - |
| Kelola MAP | Ya | - | - | - | - |
| Foto login | Ya | - | - | - | - |

---

## 9. Akun Demo

Akun-akun ini dibuat oleh seeder (`seed-user.ts`) untuk keperluan **development dan testing**.

| Role | NIPP | Password | Nama | Wilayah |
|------|------|----------|------|---------|
| Admin | `ADMIN-001` | `admin123` | Admin Super | Semua |
| QC Region A | `QC-A001` | `qc123` | QC Region A | JR 6.1 – 6.4 |
| QC Region B | `QC-B001` | `qc123` | QC Region B | JR 6.5 – 6.8 |
| QC Region C | `QC-C001` | `qc123` | QC Region C | JR 6.9 – 6.13 |
| KUPT | `KUPT-001` | `kupt123` | KUPT Jenar | JR 6.1 |
| PPJ | `KAI-1234` | `password123` | Budi Santoso | — (dikelola Admin) |

> **JANGAN gunakan akun demo ini di production!** Ganti semua password setelah deployment.

---

## 10. Fitur Utama

### 10.1 Penugasan Inspeksi

- **Manual:** Admin/KUPT memilih petugas dan stasiun via dropdown, menentukan tanggal & jam
- **Import Excel:** Unduh template → isi data → upload file `.xlsx` (maks 5 MB)
- **Kolom Excel wajib (berurutan):**

| Urutan | Kolom | Isi |
|--------|-------|-----|
| 1 | NIPP Petugas | NIPP PPJ aktif |
| 2 | Nama Petugas | Referensi; pencocokan tetap melalui NIPP |
| 3 | Titik Awal | Nama stasiun/titik tersedia |
| 4 | Titik Akhir | Berbeda dari titik awal |
| 5 | Tanggal | Format YYYY-MM-DD (contoh: `2026-09-22`) |
| 6 | Jam Mulai | Format HH:mm (contoh: `08:00`); opsional |
| 7 | Jam Selesai | Format HH:mm (contoh: `16:00`); opsional |

- Admin dapat memilih titik MAP custom miliknya sebagai titik awal/akhir
- Import mendukung normalisasi NIPP, pencocokan fuzzy nama stasiun, dan normalisasi format jam
- Belum ada deduplikasi — saat mengulang, unggah hanya baris yang gagal

### 10.2 Tracking GPS

- Petugas memulai tracking dari halaman `/inspeksi/[id]`
- **Geofence:** Radius 500 meter dari titik awal/akhir (validasi frontend & backend)
- **Time-window:** Hanya bisa dimulai 1 jam sebelum s.d. 1 jam sesudah `jam_mulai`
- GPS diperbarui setiap **15 detik** ke backend
- State perjalanan disimpan di `localStorage` untuk pemulihan sesi
- Lintasan diproyeksikan ke geometri rel (via Overpass API + Dijkstra)
- Waktu mulai dari backend sebagai sumber kebenaran timer

### 10.3 Laporan Temuan

- Petugas membuat laporan dengan foto, deskripsi, koordinat GPS, dan kategori temuan
- Kategori `error` (warna merah) memicu **sirine darurat** di dashboard Admin/QC
- Sirine berulang hingga diklik untuk dimatikan
- Preferensi suara sirine tersimpan per profil pengguna (`alert_sound`)

### 10.4 Approval & PDF

- Setelah tracking dihentikan → status `need_approval`
- Admin mereview dan meng-approve dengan status keselamatan (`aman` / `tidak_aman`)
- PDF berisi: informasi tugas, petugas, waktu, temuan, foto, peta, approval, keselamatan
- PPJ dapat mengunduh PDF **hanya setelah di-approve**
- Admin/KUPT/QC dapat mengakses draft sebelum approval

### 10.5 Alert & Warning Kereta

Dua mekanisme notifikasi:

1. **Jadwal Kereta (legacy):** Polling setiap 30 detik saat tracking aktif. Tab pengelolaan jadwal di admin sudah dihapus, tapi API dan data jadwal lama tetap tersedia.

2. **Warning PPJ (Tombol ALERT KERETA):**
   - Mengirim warning ke maks 2 PPJ terdekat (satu per sisi jalur)
   - Pengirim & penerima harus tracking aktif pada pasangan stasiun yang sama (termasuk arah terbalik)
   - GPS penerima maksimal 2 menit terakhir
   - Cooldown pengiriman: 30 detik
   - Masa berlaku warning: 2 menit
   - Polling penerima: setiap 10 detik
   - Arah kereta berasal dari titik akhir tugas PPJ pengirim

### 10.6 Peta Interaktif

- **Leaflet + OpenStreetMap** untuk semua jenis peta
- **Overpass API** untuk geometri rel (3 server failover: de, kumi, mail.ru)
- **Dijkstra** untuk shortest path di atas rel
- Warna petugas konsisten berdasarkan hash NIPP
- Menu MAP admin: marker stasiun, titik custom, pencarian alamat, input koordinat, klik/geser marker
- `z-index` strategy: Leaflet=400, Modal=9999, Map container `isolation: isolate`

### 10.7 Auto-Missed Scheduler

- Berjalan saat backend start dan setiap **5 menit**
- Tugas `pending` **hari ini** yang melewati 1 jam setelah `jam_mulai` → otomatis `missed`
- Scheduler berada dalam proses backend (bukan cron job terpisah)

### 10.8 Foto Halaman Login

- Super Admin mengelola foto slideshow di halaman login via **Setting → Foto Halaman Login**
- Mendukung PNG/JPG, maks 5 MB / 40 megapiksel
- Foto disimpan di database MySQL (LONGBLOB), bukan file system
- Slideshow berganti setiap 6 detik dengan kontrol manual dan tombol pemilih foto
- Preferensi `reduced motion` menonaktifkan pergantian otomatis
- Fallback ke `/cc206.png` jika tidak ada foto aktif

### 10.9 Kelola Akun

- Tambah, edit, aktifkan/nonaktifkan akun
- **Hapus Permanen:** konfirmasi nama/NIPP, menghapus semua data terkait (penugasan, tracking, laporan/foto, warning, wilayah, template) dalam satu transaksi
- Petugas yang dikelola akun tersebut dilepas (`managerId = null`), bukan ikut dihapus
- Ditolak untuk: akun admin, akun sendiri, akun dengan inspeksi aktif
- Token akun yang dihapus/dinonaktifkan langsung ditolak pada request berikutnya

### 10.10 Session Persistence & Offline

- State tracking disimpan di `localStorage` (trackPath, trackingId)
- Pemulihan sesi dari endpoint `active-tracking`
- Service worker PWA lama sudah dilepas; `public/sw.js` hanya membersihkan cache lama
- IndexedDB digunakan untuk penyimpanan data offline (`idb` library)

---

## 11. API Endpoints

Base URL: `/api`. Response format: `{ success, data, message }`.

Autentikasi: `Authorization: Bearer <token>`. JWT berisi `{ id, role }`, berlaku 1 hari.
Middleware memeriksa keberadaan/status aktif akun dan memakai role terbaru dari database.

### 11.1 Publik (Tanpa Auth)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `GET` | `/api/health` | Health check koneksi database |
| `POST` | `/api/auth/login` | Login dengan NIPP + password (rate limited) |
| `GET` | `/api/kategori-temuan` | Daftar kategori temuan aktif |
| `GET` | `/api/guest/map-data` | Data peta publik |
| `POST` | `/api/railway/geometry` | Proxy geometri rel Overpass |
| `GET` | `/api/login-photos` | Metadata foto login aktif |
| `GET` | `/api/login-photos/:id/image` | Gambar foto login |

### 11.2 Autentikasi & Profil (JWT)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `GET` | `/api/auth/me` | Profil pengguna login |
| `PATCH` | `/api/auth/profile` | Update profil (termasuk preferensi suara) |

### 11.3 Inspeksi & Tracking (JWT)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `GET` | `/api/tugas` | Daftar tugas petugas login |
| `GET` | `/api/tugas/summary` | Statistik tugas |
| `GET` | `/api/tugas/:id` | Detail tugas |
| `GET` | `/api/tugas/:id/report` | Unduh PDF laporan |
| `GET` | `/api/tracking/active/:tugasId` | Cek sesi tracking aktif |
| `POST` | `/api/tracking/start/:tugasId` | Mulai tracking `{ lat, lng }` |
| `POST` | `/api/tracking/update/:id` | Update posisi `{ lat, lng }` |
| `POST` | `/api/tracking/stop/:id` | Selesaikan tracking `{ lat, lng }` |
| `GET` | `/api/tracking/train-alerts` | Alert jadwal kereta aktif |
| `POST` | `/api/tracking/warnings` | Kirim warning `{ tugasId, lat, lng }` |
| `GET` | `/api/tracking/warnings/nearby` | Cek warning terdekat `?tugasId&lat&lng` |
| `GET` | `/api/laporan` | Daftar laporan petugas |
| `POST` | `/api/laporan` | Kirim laporan temuan |

### 11.4 Dashboard Admin/KUPT/QC (JWT + Role)

| Method | Endpoint | Role | Fungsi |
|--------|----------|------|--------|
| `GET` | `/api/admin/stats` | Admin, QC, KUPT | Statistik dashboard |
| `GET` | `/api/admin/petugas` | Admin, QC, KUPT | Daftar petugas |
| `GET` | `/api/admin/petugas/available` | Admin, KUPT | Petugas belum dikelola |
| `POST` | `/api/admin/petugas/add` | Admin, KUPT | Tambah petugas ke kelolaan |
| `POST` | `/api/admin/petugas/remove` | Admin, KUPT | Lepas petugas |
| `GET` | `/api/admin/tugas` | Admin, QC, KUPT | Daftar tugas |
| `POST` | `/api/admin/tugas` | Admin, KUPT | Buat tugas baru |
| `DELETE` | `/api/admin/tugas/:id` | Admin, KUPT | Hapus tugas (+ tracking + laporan) |
| `GET` | `/api/admin/tugas/template` | Admin, KUPT | Unduh template Excel |
| `POST` | `/api/admin/tugas/import` | Admin, KUPT | Import dari Excel |
| `POST` | `/api/admin/tracking/:id/approve` | Admin | Approve tracking |
| `GET` | `/api/admin/emergency` | Admin, QC, KUPT | Laporan darurat |
| `GET` | `/api/admin/live-positions` | Admin, QC, KUPT | Posisi GPS aktif |

### 11.5 Manajemen (Admin Only)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `GET` | `/api/admin/users` | Daftar semua akun |
| `POST` | `/api/admin/users` | Buat akun baru |
| `PATCH` | `/api/admin/users/:id` | Edit / aktifkan-nonaktifkan akun |
| `DELETE` | `/api/admin/users/:id` | Hapus permanen `{ confirmPermanent: true }` |
| `GET` | `/api/admin/wilayah` | Daftar wilayah |
| `GET` | `/api/admin/kategori-temuan` | Daftar semua kategori (termasuk nonaktif) |
| `POST` | `/api/admin/kategori-temuan` | Tambah kategori baru |
| `PATCH` | `/api/admin/kategori-temuan/:id` | Update kategori |
| `PATCH` | `/api/admin/kategori-temuan/reorder` | Ubah urutan kategori |
| `DELETE` | `/api/admin/kategori-temuan/:id` | Soft delete kategori |
| `GET` | `/api/admin/map-locations` | Daftar titik MAP |
| `POST` | `/api/admin/map-locations` | Tambah titik MAP |
| `DELETE` | `/api/admin/map-locations/:id` | Hapus titik MAP |
| `GET` | `/api/admin/map-search?q=...` | Pencarian alamat (proxy geocoding) |
| `GET` | `/api/admin/train-schedules` | Daftar jadwal kereta |
| `POST` | `/api/admin/train-schedules` | Tambah jadwal kereta |
| `PATCH` | `/api/admin/train-schedules/:id` | Update jadwal kereta |
| `DELETE` | `/api/admin/train-schedules/:id` | Hapus jadwal kereta |

### 11.6 Foto Login (Admin Only via CRUD, Publik via GET)

| Method | Endpoint | Auth | Fungsi |
|--------|----------|------|--------|
| `GET` | `/api/login-photos` | Publik | Metadata foto aktif |
| `GET` | `/api/login-photos/:id/image` | Publik | Gambar (termasuk nonaktif untuk pratinjau) |
| `GET` | `/api/admin/login-photos` | Admin | Daftar semua foto |
| `POST` | `/api/admin/login-photos` | Admin | Upload foto baru (multipart: photo, title, sortOrder, isActive) |
| `PATCH` | `/api/admin/login-photos/:id` | Admin | Edit foto (file opsional) |
| `DELETE` | `/api/admin/login-photos/:id` | Admin | Hapus foto |

---

## 12. Deployment Production

### 12.1 Arsitektur Deploy

Aplikasi di-deploy sebagai **2 layanan terpisah**:

```
┌──────────────────────────┐     ┌──────────────────────────┐
│     FRONTEND             │     │     BACKEND              │
│     (Vercel / Node)      │────>│     (Railway / VPS)      │
│     Next.js SSR/SSG      │     │     Express + Prisma     │
│     Port: 443 (HTTPS)    │     │     Port: 5001           │
└──────────────────────────┘     └─────────┬────────────────┘
                                           │
                                 ┌─────────v────────────────┐
                                 │     MySQL 8 Database      │
                                 └──────────────────────────┘
```

### 12.2 Langkah Deploy

| Layanan | Root Directory | Install & Build | Start |
|---------|----------------|-----------------|-------|
| Frontend | `ppj-kai-frontend` | `npm ci` → `npm run build` | `npm start` atau runtime Next.js host |
| Backend | `ppj-kai-backend` | `npm ci` (postinstall = `prisma generate`) | `npm start` (`npx tsx src/index.ts`) |

> Backend menjalankan TypeScript langsung melalui `tsx` dan **belum memiliki build step terpisah**.

### 12.3 Checklist Production

- [ ] Database MySQL tersedia dan dapat diakses
- [ ] `DATABASE_URL` mengarah ke database production
- [ ] `JWT_SECRET` menggunakan secret kuat (min 32 karakter acak)
- [ ] `FRONTEND_URL` diisi URL HTTPS frontend production (koma untuk multi-origin)
- [ ] `NEXT_PUBLIC_API_URL` mengarah ke backend production (berakhiran `/api`)
- [ ] `TRACKING_BYPASS_ENABLED=false` di backend
- [ ] `NEXT_PUBLIC_TRACKING_BYPASS_ENABLED=false` di frontend
- [ ] `NODE_ENV=production` di kedua layanan
- [ ] HTTPS aktif (diperlukan untuk GPS dan kamera)
- [ ] Schema database sudah sinkron (`db push` atau migrasi)
- [ ] Seeder kategori sudah dijalankan (`seed-kategori.ts`)
- [ ] Akun admin production sudah dibuat (JANGAN pakai akun demo)
- [ ] Password akun demo sudah diganti atau akun dihapus
- [ ] Verifikasi repository, branch, dan commit yang sama di kedua layanan
- [ ] Batas JSON/form: 10 MB (untuk foto); upload Excel: 5 MB

> **PENTING:**
> - `NEXT_PUBLIC_*` dibaca saat build — perubahan memerlukan rebuild
> - Scheduler auto-missed berjalan dalam proses backend — pastikan backend selalu running
> - Push/deploy frontend sukses belum membuktikan backend diperbarui
> - Health check membuktikan koneksi database, tapi belum menampilkan versi commit

---

## 13. Migrasi Database

### 13.1 Database Baru (Development)

```bash
cd ppj-kai-backend
npx prisma db push      # Sinkronisasi langsung dari schema.prisma
npx prisma generate      # Generate Prisma Client
```

### 13.2 Database Berisi Data (Production)

**JANGAN gunakan `db push` di production** karena bisa menghapus data!

1. **Backup database terlebih dahulu**
2. Bandingkan schema aktual dengan `schema.prisma`
3. Tinjau dan uji perubahan SQL di staging
4. Gunakan `prisma migrate deploy` jika riwayat migrasi lengkap

### 13.3 Riwayat Migrasi

| Migrasi | Isi |
|---------|-----|
| `20260507225946_init` | Tabel dasar: users, tugas_ppj, tracking, laporan |
| `20260718170000_add_map_locations` | Tabel map_locations (titik MAP) |
| `20260803120000_add_tracking_approval_train_schedules_warnings` | Approval, keselamatan, jadwal kereta, warning alerts |
| `20260910120000_add_warning_route` | Snapshot stasiun & ID sesi penerima warning |
| `20260910130000_add_need_approval_task_status` | Pembaruan status tugas lama belum approved |
| `20261013120000_add_warning_recipients` | Tabel warning_recipients |
| `20261014120000_add_login_photos` | Tabel login_photos |

> **Catatan:** Riwayat SQL belum mencakup seluruh schema terkini (beberapa kolom user, waktu tugas, wilayah, kategori). Database yang dibuat via `db push` perlu baseline sebelum `migrate deploy`. Jangan menambahkan ulang kolom yang sudah ada.

---

## 14. Pengujian

### 14.1 Backend Tests

```bash
cd ppj-kai-backend
npm test
```

Test menggunakan Node test runner + tsx. Cakupan:
- Normalisasi import Excel (pencocokan NIPP, nama stasiun, format jam)
- Status approval tugas
- Pemilihan penerima dan arah warning
- Controller dengan mock Prisma
- HTTP/JWT security regression
- CRUD foto login dan hak akses

> **Catatan:** Test ini bukan pengujian database/browser produksi.

### 14.2 Frontend Verification

```bash
cd ppj-kai-frontend
npm run lint          # ESLint check
npm run build         # Kompilasi TypeScript + Next.js build
```

Build frontend memeriksa kompilasi dan tipe TypeScript.

---

## 15. Troubleshooting

| No | Gejala | Pemeriksaan & Solusi |
|----|--------|---------------------|
| 1 | Dashboard admin kosong | Periksa `managerId` petugas — semua data admin di-scope via `managerId`. Petugas tanpa `managerId` tidak muncul. Untuk QC periksa wilayah/nama stasiun. |
| 2 | Import Excel gagal jam_mulai | Periksa format sel waktu di Excel. Gunakan format `HH:mm` atau sel waktu Excel. Backend versi baru menormalisasi serial ke HH:mm. |
| 3 | Import Excel duplikat | Belum ada deduplikasi — saat mengulang, unggah hanya baris yang gagal agar tugas berhasil tidak terduplikasi. |
| 4 | CORS / API error di production | Periksa `NEXT_PUBLIC_API_URL` saat build dan `FRONTEND_URL` di backend. Pastikan keduanya sudah benar. |
| 5 | GPS/kamera tidak berfungsi | Pastikan HTTPS aktif, izin browser diberikan, dan ada interaksi pengguna untuk audio. |
| 6 | Peta / jalur rel kosong | Periksa koneksi proxy railway/geometry dan Overpass API. Geometri bergantung data OpenStreetMap. |
| 7 | PDF tidak bisa diunduh PPJ | Periksa approval tracking terbaru — PPJ hanya bisa unduh PDF setelah di-approve. Status pending approval masuk tab Riwayat. |
| 8 | Warning hanya "dari arah" | Periksa `endPointName`/`trainDirectionName` pada respons API dan snapshot pengirim. Uji dengan warning baru. |
| 9 | Tidak ada penerima warning | Periksa: pasangan stasiun sama (termasuk arah terbalik), tracking aktif, GPS terbaru (maks 2 menit), ada PPJ lain di jalur yang sama. |
| 10 | Tampilan/cache lama | Muat ulang/tutup-buka aplikasi. Service worker pembersih akan menghapus cache PWA lama. |
| 11 | Tugas tidak auto-missed | Pastikan backend berjalan terus (scheduler jalan di proses backend setiap 5 menit). |
| 12 | Login foto tidak muncul | Pastikan migrasi `20261014120000_add_login_photos` sudah dijalankan atau tabel sudah ada. |
| 13 | `canvas` error saat install | Install native library yang dibutuhkan (cairo, pango, libjpeg, dll.) sesuai OS. |
| 14 | Module not found `prisma/config` | Periksa kesesuaian `prisma.config.ts` dengan versi Prisma 5.20. |

---

## 16. Catatan Penting untuk Developer

### 16.1 Arsitektur & Pattern Kunci

1. **managerId Pattern:** Semua data admin/KUPT di-scope melalui `managerId`. Petugas tanpa `managerId` tidak tampil di dashboard manapun. Seeder harus membuat admin dulu, lalu petugas dengan `managerId: admin.id`.

2. **JWT Payload:** Hanya berisi `{ id, role }` — **TIDAK ada** `nipp`. Jangan akses `req.user.nipp` dari JWT decoded.

3. **Status Normalisasi:** Backend dan frontend menormalisasi status tugas dari tracking terbaru. Data lama `completed` tapi `not_approved` dikirim sebagai `need_approval`.

4. **Halaman Petugas:** Hanya ada `/inspeksi` — tidak ada dashboard, riwayat, atau profil terpisah. Semua redirect petugas ke `/inspeksi`.

5. **Prisma schema** = satu-satunya sumber kebenaran untuk struktur database.

6. **Waktu dalam WIB (UTC+7):** `tanggal` dari Prisma berupa Date (UTC midnight), `jamMulai` dalam format `HH:mm` WIB.

### 16.2 Konvensi Kode

- **Backend** dijalankan langsung melalui `tsx` — tidak ada transpile/build step
- **Frontend** menggunakan Next.js App Router (folder-based routing)
- **Kategori temuan** bersifat dinamis dari database — JANGAN hardcode
- **Station dropdown** menggunakan data dari `STATIONS` di `admin/page.tsx` dan `lib/stations.ts`
- **AdminMap read-only** — JANGAN tambah click handler
- **Overpass API** — Selalu pakai `fetchOverpass()` dari `railway.ts` dengan failover 3 mirror. JANGAN hardcode 1 endpoint.
- **Geometry cache** — Jangan cache hasil kosong agar bisa retry.

### 16.3 File-File Penting yang Perlu Dipahami Pertama

| File | Fungsi | Prioritas |
|------|--------|-----------|
| `prisma/schema.prisma` | Sumber kebenaran struktur database | Wajib |
| `src/index.ts` (backend) | Entry point, routes, middleware, scheduler | Wajib |
| `src/controllers/admin.controller.ts` | Controller terbesar — semua operasi admin | Tinggi |
| `src/app/admin/page.tsx` | Halaman terbesar — dashboard admin (~580 baris) | Tinggi |
| `src/app/inspeksi/[id]/page.tsx` | Halaman terbesar PPJ — tracking GPS (~850 baris) | Tinggi |
| `src/lib/api.ts` (frontend) | Axios instance, base URL, JWT interceptor | Tinggi |
| `src/lib/railway.ts` (frontend) | Overpass API + Dijkstra routing | Sedang |
| `globals.css` | Design tokens Material Design 3 | Sedang |
| `seed-user.ts` | Data wilayah dan akun demo | Sedang |

### 16.4 Yang JANGAN Dilakukan

- **JANGAN** baca `package-lock.json` atau `node_modules/`
- **JANGAN** hardcode kategori temuan — gunakan API CRUD
- **JANGAN** tambah click handler ke AdminMap (read-only)
- **JANGAN** redirect petugas ke `/dashboard` (sudah tidak ada)
- **JANGAN** hardcode 1 endpoint Overpass — gunakan failover dari `railway.ts`
- **JANGAN** cache hasil kosong geometri rel
- **JANGAN** jalankan seeder otomatis di production
- **JANGAN** pakai `db push` di production database berisi data
- **JANGAN** duplikasi fungsi `petugasColor()` — sudah ada di AdminMap dan admin/page.tsx
- **JANGAN** buat halaman baru untuk petugas di luar flow inspeksi

### 16.5 Script NPM

**Backend (`ppj-kai-backend`):**

| Script | Perintah | Keterangan |
|--------|----------|------------|
| `npm run dev` | `npx tsx watch src/index.ts` | Development dengan hot reload |
| `npm start` | `npx tsx src/index.ts` | Production |
| `npm test` | `node --import tsx --test src/**/*.test.ts` | Jalankan test |
| postinstall | `prisma generate` | Auto-generate Prisma Client |

**Frontend (`ppj-kai-frontend`):**

| Script | Perintah | Keterangan |
|--------|----------|------------|
| `npm run dev` | `next dev --webpack` | Development server (port 3000) |
| `npm run build` | `next build --webpack` | Build production |
| `npm start` | `next start` | Production server |
| `npm run lint` | `eslint .` | Lint check |

---

> **Catatan:** Proyek ini dikembangkan untuk kebutuhan prototipe/internal PT KAI DAOP 6 Yogyakarta. Repository belum menyertakan berkas LICENSE khusus untuk ketentuan penggunaan seluruh proyek.
