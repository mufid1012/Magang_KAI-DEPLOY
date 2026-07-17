# AGENTS.md — Panduan untuk AI Coding Agent

> File ini berisi konteks lengkap proyek agar AI agent tidak perlu membaca ulang semua file setiap sesi. Baca file ini PERTAMA sebelum melakukan perubahan apapun.

---

## Ringkasan Proyek

**KAI RailTrack PPJ** — Sistem monitoring inspeksi jalur rel kereta api untuk PT KAI DAOP 6 Yogyakarta.
Terdiri dari 2 modul: **Frontend** (Next.js 14) dan **Backend** (Express 5 + Prisma + MySQL).

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | Next.js 14, React 18, TailwindCSS 3.4, Leaflet 1.9, Axios, TypeScript 5 |
| Backend | Express 5, Prisma 5.20, MySQL 8, JWT (jsonwebtoken), bcryptjs, TypeScript 6 |
| Peta | OpenStreetMap tiles, Overpass API (query geometri rel), Leaflet.js |
| Auth | JWT Bearer token, role: `admin` \| `qc` \| `kupt` \| `guest` \| `ppj` |

---

## Struktur & File Penting

### Backend (`ppj-kai-backend/`)

```
src/
├── index.ts                    # Entry point. Port dari .env (default 5001)
├── config/database.ts          # Prisma client singleton
├── middleware/auth.middleware.ts # requireAuth (JWT), requireRole (role check)
├── controllers/
│   ├── auth.controller.ts      # login, register, checkNipp, getMe
│   ├── tugas.controller.ts     # getTugasPetugas, getTugasSummary, getTugasById
│   ├── tracking.controller.ts  # startTracking, stopTracking, updateTracking, getActiveTracking
│   ├── laporan.controller.ts   # createLaporan, getLaporan
│   ├── admin.controller.ts     # CRUD users, tugas, kategori temuan, stats, manajemen PPJ
│   ├── guest.controller.ts     # Guest access untuk live view & stats
│   └── import.controller.ts    # Import data dari Excel/CSV
└── routes/
    ├── auth.routes.ts           # /api/auth/*
    ├── tugas.routes.ts          # /api/tugas/* (requireAuth)
    ├── tracking.routes.ts       # /api/tracking/* (requireAuth)
    ├── laporan.routes.ts        # /api/laporan/* (requireAuth)
    ├── admin.routes.ts          # /api/admin/* (auth + role: admin)
    └── guest.routes.ts          # /api/guest/* (auth + role: guest/qc/kupt)

prisma/schema.prisma             # Skema DB (9 Tabel: User, Tugas, Tracking, Laporan, Wilayah, Kategori dll)
seed-user.ts                     # Seeder: Wilayah, Roles (Admin, QC, KUPT, PPJ) + Sample Tugas
seed-kategori.ts                 # Seeder: Kategori temuan default
.env                             # DATABASE_URL, PORT, JWT_SECRET
```

### Frontend (`ppj-kai-frontend/`)

```
src/
├── app/
│   ├── layout.tsx              # Root layout, Google Fonts (Outfit), Material Symbols
│   ├── page.tsx                # Landing/splash → redirect ke /login
│   ├── login/page.tsx          # Login form (NIPP + password) → redirect role-based
│   ├── register/page.tsx       # Register form
│   ├── inspeksi/               # Halaman Petugas (PPJ)
│   │   ├── page.tsx            # Task selector / empty state "Tugas Belum Tersedia"
│   │   ├── [id]/page.tsx       # ⭐ HALAMAN TERBESAR. Tracking GPS + Map + Kamera + Emergency
│   │   └── [id]/selesai/page.tsx # Halaman ringkasan setelah inspeksi selesai
│   ├── admin/page.tsx          # ⭐ Dashboard Admin: 2-menu sidebar, Kelola Penugasan, Petugas, Template, Kategori
│   ├── qc/page.tsx             # Dashboard QC (Monitoring & Laporan berdasar Wilayah JR)
│   ├── guest/page.tsx          # Dashboard Guest (Live View saja)
│   └── globals.css             # Design tokens Material Design 3 (warna, spacing, typography)
├── components/
│   ├── map/
│   │   ├── AdminMap.tsx        # Peta untuk Admin/QC (task routes, emergency markers)
│   │   ├── DynamicMap.tsx      # Peta Tracking untuk PPJ (GPS dot, track path)
│   │   └── GuestMap.tsx        # Peta Live View Guest
│   ├── ppj/
│   │   ├── DetailModal.tsx     # Modal Laporan Detail
│   │   ├── TabHistory.tsx      # History PPJ
│   │   ├── TabPenjadwalan.tsx  # Penjadwalan Tugas (Manual & Excel Import)
│   │   └── TabTracking.tsx     # Tab Active Tracking (Peta, Insiden)
│   ├── common/
│   │   └── AuthGuard.tsx       # Route Protection
│   └── layout/
│       └── BottomNav.tsx       # Bottom navigation bar (hanya item Track)
└── lib/
    ├── api.ts                  # Axios base instance, auto-attach JWT
    ├── railway.ts              # ⭐ Overpass API fetch (3 failover) & Dijkstra route
    └── utils.ts                # cn() helper
```

---

## Database Schema (MySQL)

```
users (User)
├── id: Int (PK, auto)
├── nipp: String (unique, 20)
├── nama: String (100)
├── password: String (255, bcrypt hash)
├── foto: Text? (base64)
├── role: String (20, default "ppj") → "admin" | "qc" | "kupt" | "guest" | "ppj"
├── jabatan, division, work_area, phone: String?
├── is_active: Boolean (default true)
├── manager_id: Int? (FK → users.id) — admin yang mengelola petugas ini
└── Relasi: manager, petugasManaged, tugas_ppj, user_wilayah

tugas_ppj (TugasPpj)
├── id: Int (PK, auto)
├── jalur: String (200)
├── tanggal: Date
├── start_point_lat/long, end_point_lat/long: Float
├── start_point_name, end_point_name: String?
├── jam_mulai, jam_selesai: String?
├── assigned_to: Int (FK → users.id)
├── status: String (20) → "pending" | "in_progress" | "completed" | "cancelled" | "missed"
└── Relasi: tracking

tracking (Tracking)
├── id: Int (PK, auto)
├── tugas_id: Int (FK → tugas_ppj.id)
├── start_time/end_time: DateTime?
├── start_lat/long, end_lat/long: Float?
├── durasi: Int? (seconds)
├── status: String (20) → "started" | "stopped"
├── foto_awal, foto_selesai: Text?
├── route_path: Text? (JSON)
└── Relasi: laporan

laporan (Laporan)
├── id: Int (PK, auto)
├── tracking_id: Int (FK → tracking.id)
├── jenis_temuan: String (20) → Relasi longgar ke KategoriTemuan.key
├── deskripsi: Text
├── foto: Text?
└── latitude/longitude: Float

wilayah (Wilayah)
├── id: Int (PK, auto)
├── kode: String (unique) — e.g. "JR 6.1"
├── nama: String — e.g. "Jenar"
└── stations: Text (JSON array of station names)

user_wilayah (UserWilayah)
├── userId, wilayahId (Composite unique, FKs)
└── Penghubung relasi many-to-many QC/KUPT dengan Wilayah.

template_penugasan (TemplatePenugasan)
├── id: Int (PK, auto)
├── nama: String
├── created_by: Int
└── Relasi: template_item

template_item (TemplateItem)
├── id: Int (PK, auto)
├── template_id: Int (FK)
├── assigned_to: Int
├── start_point_name, end_point_name, start/end lat/long
└── jam_mulai, jam_selesai

kategori_temuan (KategoriTemuan)
├── id: Int (PK, auto)
├── key: String (unique) — e.g. "berat", "ringan"
├── label, icon: String
├── color: String (default "primary")
├── is_active: Boolean (soft delete)
└── sort_order: Int
```

---

## API Endpoints

### Public
- `POST /api/auth/login` → `{ nipp, password }` → `{ token, user }`
- `GET /api/auth/check/:nipp` → cek NIPP exists
- `GET /api/kategori-temuan` → daftar kategori aktif (tidak butuh auth, dipanggil petugas)

### Petugas / Umum (requireAuth)
- `GET /api/auth/me` → full user profile
- `PATCH /api/auth/profile` → update profil sendiri (NIPP & role read-only)
- `GET /api/tugas` → tugas milik petugas yang login
- `GET /api/tugas/summary` → statistik (total, pending, completed)
- `GET /api/tugas/:id` → detail satu tugas
- `GET /api/tracking/active/:tugasId` → cek apakah ada tracking aktif (untuk session restore)
- `POST /api/tracking/start/:tugasId` → `{ lat, lng }` → `{ trackingId }`
- `POST /api/tracking/update/:id` → `{ lat, lng }`
- `POST /api/tracking/stop/:id` → `{ lat, lng }`
- `POST /api/laporan` → `{ trackingId, jenisTemuan, deskripsi, foto?, latitude, longitude }`
- `GET /api/laporan` → list laporan milik petugas

### Admin (requireAuth + requireRole('admin'))
> **Penting**: Operasi admin sering di-scope by `managerId`. Admin hanya bisa melihat/mengelola petugas yang `managerId`-nya = ID admin yang login.
- `GET /api/admin/stats` → counts (petugas, tugas, aktif, emergency) — scoped by managerId
- `GET /api/admin/petugas` → list petugas yang dikelola admin ini
- `GET /api/admin/petugas/available` → list petugas yang belum dikelola siapapun
- `POST /api/admin/petugas/add` → assign petugas ke admin ini (set managerId)
- `POST /api/admin/petugas/remove` → lepas petugas dari kelolaan admin
- `GET /api/admin/tugas` → list tugas milik petugas kelolaan admin + tracking + laporan
- `POST /api/admin/tugas` → buat tugas baru
- `DELETE /api/admin/tugas/:id` → hapus tugas
- `GET /api/admin/emergency` → list laporan darurat dari petugas kelolaan admin
- `GET /api/admin/kategori-temuan`, `POST`, `PUT`, `DELETE` → CRUD Kategori Temuan
- `POST /api/admin/import/preview`, `/import/process` → Preview dan proses Import Excel

### Guest / QC / KUPT (requireRole('guest', 'qc', 'kupt'))
- `GET /api/guest/stats`
- `GET /api/guest/tugas`
- `GET /api/guest/emergency`

---

## Fitur Teknis Penting

### 1. Kategori Temuan Dinamis (Baru)
- Kategori laporan tidak di-hardcode. Data ditarik dari database `kategori_temuan` melalui API GET `/api/kategori-temuan`.
- Admin dapat melakukan CRUD kategori (tambah/edit soft-delete).
- Komponen frontend seperti `TabTracking` dan `DetailModal` menggunakan `useEffect` untuk _fetch_ data dan me-map label/icon, dengan fallback ke default jika gagal.

### 2. Wilayah / Station Mapping (Baru)
- Project ini menerapkan pembagian DAOP 6 ke dalam area Wilayah (JR 6.1 s/d JR 6.13).
- Tugas di-filter berdasarkan `UserWilayah` yang melekat pada KUPT/QC.
- Titik koordinat stasiun ditarik/terikat dengan penamaan area ini.

### 3. Excel Import/Export Penugasan (Baru)
- Admin bisa import jadwal bulanan melalui Excel.
- Template mencakup titik mulai, titik selesai, NIPP, dan Nama Petugas. Parser excel ditangani di backend (`import.controller.ts`).

### 4. Emergency Loop Sound (Baru)
- Saat petugas mengirimkan laporan berstatus "emergency" atau "berat" (tergantung *flag* di db), frontend QC/Admin akan memutar suara alarm darurat secara berulang (looping) hingga ada interaksi klik dari user untuk mematikannya.

### 5. Overpass API + Dijkstra (`lib/railway.ts`)
- Request `way[railway]` dari Overpass API dalam area bounding box.
- Bangun adjacency graph dari nodes, lalu jalankan shortest-path Dijkstra antara dua titik di atas rel.
- **Failover otomatis** ke 3 server cermin Overpass (de, kumi, mail.ru).

### 6. Station Dropdown (Admin — Pengganti Map-Click)
- Admin **tidak lagi** klik peta untuk menentukan titik — menggunakan **dropdown stasiun**.
- Data 15 stasiun hardcoded di konstanta `STATIONS` di `admin/page.tsx`.
- Auto-fill `jalur`, `startPoint`, dan `endPoint`.

### 7. Geometry Cache (AdminMap)
- Railway geometry di-cache dalam `useRef<Map>` keyed by koordinat start-end agar polling tidak menembak Overpass berkali-kali. Hanya cache hasil non-empty.

### 8. Admin Page — 2-Menu Sidebar
- Halaman admin memiliki **sidebar vertikal** dengan 2 menu: **Tugas** (CRUD tugas & petugas, tanpa peta) & **Live** (Full-screen AdminMap).

### 9. Task Selection Flow (`/inspeksi`) — Halaman Utama Petugas
- **Ini adalah satu-satunya halaman petugas** (dashboard, riwayat, profile sudah dihapus).
- Flow: Login → `/inspeksi` (task selector) → `/inspeksi/:id` (tracking) → `/inspeksi/:id/selesai`.
- Filter tugas: hanya tampilkan `pending` dan `in_progress`.

### 10. BottomNav Component
- Hanya berisi item **Track** → `/inspeksi`. Diatur lewat `BottomNav.tsx`.

### 11. Header Konsisten
- Halaman petugas menggunakan header centered text (contoh: "Inspeksi Berlangsung") tanpa tombol/avatar yang tidak perlu.

### 12. Geofencing Tracking
- Radius: **500 meter** (konstanta `GEOFENCE_RADIUS`). Petugas tidak bisa Start Tracking jika di luar radius.

### 13. Session Persistence
- Start tracking → simpan ke `localStorage` (`trackPath`, `trackingId`).
- Update GPS → update local storage.
- Backend `startTime` adalah sumber kebenaran waktu.

### 14. Warna Per Petugas
- Hash deterministik dari NIPP → HSL hue. Sama NIPP = sama warna di peta AdminMap.

### 15. Z-Index Strategy (Leaflet vs Modal)
- Leaflet = z-index 400. Modal overlay = `z-[9999]`. Map container dipisahkan dengan `isolation: isolate`.

### 16. Time-Window Tracking (Baru)
- Tombol "Mulai Tracking" hanya bisa ditekan dalam rentang **1 jam sebelum** sampai **1 jam sesudah** `jam_mulai`.
- Validasi dilakukan di **frontend** (disable button + pesan) DAN **backend** (`startTracking` return 400 jika di luar window).
- Jika `jamMulai` null, time-window dilewati (backward compatible).
- Waktu dihitung dalam WIB (UTC+7). `tanggal` dari Prisma berupa Date (UTC midnight), `jamMulai` dalam format `"HH:MM"` WIB.

### 17. Auto-Missed Scheduler (Baru)
- `src/lib/scheduler.ts` — `setInterval` setiap 5 menit.
- Cari tugas `pending` hari ini yang `jam_mulai + 1 jam` sudah terlewat → update status ke `missed`.
- Dijalankan saat server start via `startMissedTaskScheduler()` di `index.ts`.
- Status `missed` ditampilkan di frontend dengan warna rose/merah muda dan card disabled.

---

## Roles & Hak Akses

1. **Admin (`admin`)**: Akses penuh ke seluruh wilayah, bisa tambah tugas, kelola PPJ, import/export template, CRUD kategori insiden.
2. **QC (`qc`)**: Memonitor beberapa wilayah (contoh: QC Region A pegang JR 6.1 - 6.4). Bisa lihat tugas dan live tracking di wilayahnya.
3. **KUPT (`kupt`)**: Memonitor satu wilayah spesifik (contoh: KUPT Jenar pegang JR 6.1). Bisa lihat tugas dan live tracking.
4. **Petugas PPJ (`ppj`)**: Menerima tugas, start tracking, input laporan.
5. **Guest (`guest`)**: Hanya bisa melihat GuestMap (Live View tanpa aksi manipulasi data).

## Akun Default (dari seed-user.ts)

| Role | NIPP | Password |
|------|------|----------|
| Admin | `ADMIN-001` | `admin123` |
| QC | `QC-A001` | `qc123` |
| KUPT | `KUPT-001` | `kupt123` |
| PPJ | `KAI-1234` | `password123` |

---

## Cara Menjalankan

```bash
# Terminal 1 — Backend
cd ppj-kai-backend
npm install
npx prisma db push && npx prisma generate
npx tsx seed-user.ts       # Wajib untuk inisialisasi Wilayah & Akun
npx tsx seed-kategori.ts   # Wajib untuk inisialisasi Kategori Laporan (Baru)
npm run dev                # Menjalankan npx tsx watch src/index.ts

# Terminal 2 — Frontend
cd ppj-kai-frontend
npm install
npm run dev                # Menjalankan Next.js dev server di port 3000
```

---

## Tips untuk Agent

1. **JANGAN baca `package-lock.json`** — file ini ratusan ribu baris dan tidak berguna untuk context.
2. **JANGAN baca `node_modules/`** — gunakan `package.json` untuk cek dependency.
3. **JANGAN baca `tsconfig.json`** kecuali ada error TypeScript config.
4. **File terbesar**: `inspeksi/[id]/page.tsx` (~850 baris) dan `admin/page.tsx` (~580 baris) — baca per section, jangan sekaligus.
5. **Prisma schema** = sumber kebenaran untuk struktur database.
6. **`globals.css`** = semua design tokens (warna, spacing, typography, font sizes).
7. Selalu cek `lib/api.ts` untuk base URL dan interceptor sebelum debug API calls.
8. Railway logic ada SEMUA di `lib/railway.ts` — satu file, satu concern. Termasuk `fetchRailwayGeometry()` dan `snapToRailwayPoint()`.
9. **Jangan duplikasi `petugasColor()`** — sudah ada di AdminMap.tsx dan admin/page.tsx, idealnya dipindah ke utils jika perlu di tempat lain.
10. **Halaman petugas HANYA `/inspeksi`** — dashboard, riwayat, dan profile sudah DIHAPUS. JANGAN buat halaman baru untuk petugas di luar flow inspeksi.
11. **managerId pattern** — Semua data admin di-scope via `managerId`. Seeder HARUS buat admin dulu, lalu petugas dengan `managerId: admin.id`. Tanpa ini, dashboard admin kosong total.
12. **JWT payload** hanya berisi `{ id, role }` — TIDAK ada `nipp`. Jangan akses `req.user.nipp` dari JWT decoded.
13. **BottomNav** — Hanya berisi item Track (`/inspeksi`). Komponen dari `components/layout/BottomNav.tsx`.
14. **Header halaman petugas** — Selalu centered, hanya teks, style seragam. Lihat bagian "Header Konsisten" di atas.
15. **Overpass API** — JANGAN hardcode 1 endpoint. Selalu pakai `fetchOverpass()` dari `railway.ts` yang punya failover 3 mirror.
16. **Geometry cache** — AdminMap cache geometry di `useRef`. Jangan cache hasil kosong agar bisa retry.
17. **Semua redirect petugas** → `/inspeksi`. JANGAN redirect ke `/dashboard` (sudah tidak ada).
18. **Admin sidebar** — 2 menu: Tugas (penugasan) dan Live (live view peta). State `activeMenu`. JANGAN tambah menu baru tanpa alasan.
19. **Station dropdown** — Koordinat stasiun hardcoded di `STATIONS` array di `admin/page.tsx`. JANGAN pakai map-click untuk pilih lokasi tugas. Jika perlu tambah stasiun, edit `STATIONS` constant.
20. **AdminMap read-only** — AdminMap TIDAK punya `pickMode`, `onMapClick`, `tempStart`, `tempEnd`. Hanya display task routes + emergency. JANGAN tambah click handler ke AdminMap.
21. **Kategori Temuan (Baru)** — Kategori temuan bersifat dinamis dari `kategori_temuan` db. JANGAN lagi gunakan list *hardcode* jika API CRUD telah tersedia.
