# AGENTS.md — Panduan untuk AI Coding Agent

> File ini berisi konteks lengkap proyek agar AI agent tidak perlu membaca ulang semua file setiap sesi. Baca file ini PERTAMA sebelum melakukan perubahan apapun.

---

## Ringkasan Proyek

**KAI RailTrack PPJ** — Sistem monitoring inspeksi jalur rel kereta api untuk PT KAI.
Terdiri dari 2 modul: **Frontend** (Next.js 14) dan **Backend** (Express 5 + Prisma + MySQL).

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | Next.js 14, React 18, TailwindCSS 3.4, Leaflet 1.9, Axios, TypeScript 5 |
| Backend | Express 5, Prisma 5.20, MySQL 8, JWT (jsonwebtoken), bcryptjs, TypeScript 6 |
| Peta | OpenStreetMap tiles, Overpass API (query geometri rel), Leaflet.js |
| Auth | JWT Bearer token, role: `admin` \| `petugas` |

---

## Struktur & File Penting

### Backend (`ppj-kai-backend/`)

```
src/
├── index.ts                    # Entry point. Port dari .env (default 5001)
├── config/database.ts          # Prisma client singleton
├── middleware/auth.middleware.ts # requireAuth (JWT), requireAdmin (role check)
├── controllers/
│   ├── auth.controller.ts      # login, getMe, checkNipp, updateProfile
│   ├── tugas.controller.ts     # getTugasPetugas, getTugasSummary, getTugasById
│   ├── tracking.controller.ts  # startTracking, stopTracking, updateTracking, getActiveTracking
│   ├── laporan.controller.ts   # createLaporan, getLaporan
│   └── admin.controller.ts     # getStats, getAllPetugas, getAvailablePetugas, addPetugasToManager, removePetugasFromManager, getAllTugas, createTugas, deleteTugas, getAllEmergency
└── routes/
    ├── auth.routes.ts           # /api/auth/*
    ├── tugas.routes.ts          # /api/tugas/* (requireAuth)
    ├── tracking.routes.ts       # /api/tracking/* (requireAuth)
    ├── laporan.routes.ts        # /api/laporan/* (requireAuth)
    └── admin.routes.ts          # /api/admin/* (requireAuth + requireAdmin)

prisma/schema.prisma             # 4 tabel: User, TugasPpj, Tracking, Laporan
seed-user.ts                     # Seeder: admin PERTAMA, lalu petugas KAI-1234 (dengan managerId → admin) + 2 tugas sample
.env                             # DATABASE_URL, PORT, JWT_SECRET
```

### Frontend (`ppj-kai-frontend/`)

```
src/
├── app/
│   ├── layout.tsx              # Root layout, Google Fonts (Outfit), Material Symbols
│   ├── page.tsx                # Landing/splash → redirect ke /login
│   ├── login/page.tsx          # Login form (NIPP + password) → redirect ke /inspeksi (petugas) atau /admin
│   ├── register/page.tsx       # Register form → redirect ke /inspeksi (petugas) atau /admin
│   ├── inspeksi/page.tsx       # ⭐ Halaman utama petugas: task selector / empty state "Tugas Belum Tersedia"
│   ├── inspeksi/[id]/page.tsx  # ⭐ HALAMAN TERBESAR (~850 baris). Tracking GPS + peta + geofencing + kamera + emergency
│   ├── inspeksi/[id]/selesai/page.tsx # Halaman ringkasan setelah inspeksi selesai
│   ├── admin/page.tsx          # ⭐ Dashboard admin: sidebar + peta + modal CRUD tugas
│   └── globals.css             # Design tokens Material Design 3 (warna, spacing, typography)
├── components/
│   ├── map/
│   │   ├── DynamicMap.tsx      # Peta petugas: GPS dot, track path, route A→B (Overpass + Dijkstra)
│   │   └── AdminMap.tsx        # Peta admin: task routes, emergency markers, pick mode (snap ke rel), warna per petugas
│   ├── common/
│   │   ├── AuthGuard.tsx       # Redirect ke /login jika belum auth, petugas route hanya /inspeksi
│   │   └── OfflineSyncProvider.tsx # PWA offline queue
│   └── layout/
│       └── BottomNav.tsx       # Bottom navigation bar (hanya item Track → /inspeksi)
├── lib/
│   ├── api.ts                  # Axios instance, base URL localhost:5001/api, auto-attach JWT
│   ├── railway.ts              # ⭐ Overpass API fetch (3 endpoint failover) + Dijkstra pathfinding + snapToRailwayPoint
│   └── utils.ts                # cn() helper (clsx + tailwind-merge)
└── hooks/
    └── useOfflineSync.ts       # Hook untuk offline data queue
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
├── role: String (20, default "petugas") → "admin" | "petugas"
├── jabatan: String? (100) — e.g. "Track Inspector"
├── division: String? (100) — e.g. "DAOP 1 Jakarta"
├── work_area: String? (100) — e.g. "Sektor 4 (GMR-JAKK)"
├── phone: String? (30) — e.g. "+62 812-3456-7890"
├── is_active: Boolean (default true)
├── manager_id: Int? (FK → users.id, self-relation) — admin yang mengelola petugas ini
├── manager: User? (self-relation "ManagerPetugas")
├── petugasManaged: User[] (self-relation "ManagerPetugas")
└── 1:N → tugas_ppj

tugas_ppj (TugasPpj)
├── id: Int (PK, auto)
├── jalur: String (200)
├── tanggal: Date
├── start_point_lat/long: Float
├── end_point_lat/long: Float
├── start_point_name/end_point_name: String? (200)
├── assigned_to: Int (FK → users.id)
├── status: String (20) → "pending" | "in_progress" | "completed" | "cancelled"
└── 1:N → tracking

tracking (Tracking)
├── id: Int (PK, auto)
├── tugas_id: Int (FK → tugas_ppj.id)
├── start_time/end_time: DateTime?
├── start_lat/long, end_lat/long: Float?
├── durasi: Int? (seconds)
├── status: String (20) → "started" | "stopped"
└── 1:N → laporan

laporan (Laporan)
├── id: Int (PK, auto)
├── tracking_id: Int (FK → tracking.id)
├── jenis_temuan: String (20) → "ringan" | "berat" | "emergency"
├── deskripsi: Text
├── foto: Text? (base64 encoded)
├── latitude/longitude: Float
└── created_at: DateTime
```

---

## API Endpoints

### Public
- `POST /api/auth/login` → `{ nipp, password }` → `{ token, user }`
- `GET /api/auth/check/:nipp` → cek NIPP exists

### Petugas (requireAuth)
- `GET /api/auth/me` → full user profile (id, nipp, nama, role, foto, jabatan, division, workArea, phone, isActive)
- `PATCH /api/auth/profile` → `{ nama?, foto?, phone?, password? }` → update profil sendiri (NIPP & role read-only)
- `GET /api/tugas` → tugas milik petugas yang login
- `GET /api/tugas/summary` → statistik (total, pending, completed)
- `GET /api/tugas/:id` → detail satu tugas
- `GET /api/tracking/active/:tugasId` → cek apakah ada tracking aktif (untuk session restore)
- `POST /api/tracking/start/:tugasId` → `{ lat, lng }` → `{ trackingId }`
- `POST /api/tracking/update/:id` → `{ lat, lng }`
- `POST /api/tracking/stop/:id` → `{ lat, lng }`
- `POST /api/laporan` → `{ trackingId, jenisTemuan, deskripsi, foto?, latitude, longitude }`
- `GET /api/laporan` → list laporan milik petugas

### Admin (requireAuth + requireAdmin)

> **Penting**: Semua endpoint admin di-scope by `managerId`. Admin hanya bisa melihat/mengelola petugas yang `managerId`-nya = ID admin yang login. Petugas tanpa `managerId` tidak akan muncul di dashboard admin manapun.

- `GET /api/admin/stats` → counts (petugas, tugas, aktif, emergency) — scoped by managerId
- `GET /api/admin/petugas` → list petugas yang dikelola admin ini (`managerId = adminId`)
- `GET /api/admin/petugas/available` → list petugas yang belum dikelola siapapun (`managerId = null`)
- `POST /api/admin/petugas/add` → `{ nipps: string[] }` → assign petugas ke admin ini (set managerId)
- `POST /api/admin/petugas/remove` → `{ id: number }` → lepas petugas dari kelolaan admin (set managerId = null)
- `GET /api/admin/tugas` → list tugas milik petugas kelolaan admin + tracking + laporan
- `POST /api/admin/tugas` → buat tugas baru (hanya bisa assign ke petugas kelolaan sendiri)
- `DELETE /api/admin/tugas/:id` → hapus tugas (hanya milik petugas kelolaan sendiri)
- `GET /api/admin/emergency` → list laporan darurat dari petugas kelolaan admin + koordinat

---

## Fitur Teknis Penting

### 1. Overpass API + Dijkstra (`lib/railway.ts`)
- Query `way[railway]` di bounding box dari Overpass API
- Bangun adjacency graph dari semua node rel
- Jalankan Dijkstra shortest path dari node terdekat A ke B
- Return path sebagai `[number, number][]` untuk polyline
- Dipakai di DynamicMap (petugas) dan AdminMap (admin)
- **3 endpoint failover otomatis**: `overpass-api.de` → `overpass.kumi.systems` → `maps.mail.ru`
- Jika endpoint pertama gagal/timeout → otomatis coba mirror berikutnya
- AbortController timeout 15 detik per request
- `fetchRailwayGeometry()` — untuk route polyline antar 2 titik
- `snapToRailwayPoint()` — untuk snap koordinat klik ke rel terdekat (radius 1000m)

### 2. Railway Snap (AdminMap)
- Saat admin klik peta dalam pick mode → `snapToRailwayPoint()` dari `railway.ts`
- Cari node/way dengan tag `railway` terdekat dalam radius **1000 meter**
- Snap koordinat ke titik di rel, return nama rel dari OSM tags
- **Fallback**: jika Overpass API gagal total → gunakan koordinat raw dengan nama "Titik Manual"
- Tidak pernah block user — selalu bisa menempatkan titik

### 3. Geometry Cache (AdminMap)
- Railway geometry di-cache dalam `useRef<Map>` keyed by koordinat start-end
- Polling 15 detik TIDAK trigger ulang Overpass API — pakai cache
- **Hanya cache hasil non-empty** — jika fetch gagal (return `[]`), akan retry di render berikutnya
- Cache persist selama komponen mounted

### 4. Task Selection Flow (`/inspeksi`) — Halaman Utama Petugas
- **Ini adalah satu-satunya halaman petugas** (dashboard, riwayat, profile sudah dihapus)
- Setelah login, petugas langsung masuk ke `/inspeksi`
- **0 tugas aktif** → tampilkan empty state "Tugas Belum Tersedia" dengan pesan informatif
- **Ada tugas `in_progress`** → auto-redirect ke `/inspeksi/:id`
- **Ada tugas `pending`** → tampilkan daftar pilihan tugas (jalur, jarak, tanggal)
- Filter: hanya tampilkan `pending` dan `in_progress`

### 5. BottomNav Component
- Komponen `BottomNav.tsx` hanya berisi item **Track** → `/inspeksi`
- Active state berdasarkan `usePathname()` match
- Halaman `inspeksi/[id]/page.tsx` masih menggunakan inline bottom nav (hanya Track)

### 6. Header Konsisten
- Halaman petugas menggunakan header centered dengan style yang sama:
  - `bg-surface/80 backdrop-blur-md shadow-sm sticky top-0 z-50 flex items-center justify-center`
  - Font: `font-h2 text-h2 font-bold text-primary tracking-tight`
- Mapping: `/inspeksi` → "Lacak", `/inspeksi/[id]` → judul tugas / "Inspeksi Berlangsung", `/inspeksi/[id]/selesai` → "Detail Inspeksi"
- **Jangan tambah tombol/avatar di header** — hanya teks centered

### 7. Geofencing
- Radius: **500 meter** (konstanta `GEOFENCE_RADIUS` di `inspeksi/[id]/page.tsx`)
- Haversine distance antara GPS user dan `startPointLat/Long` tugas
- Tombol start disabled sampai user masuk radius
- **Mode Testing**: toggle di localhost yang bypass geofencing

### 8. Session Persistence
- Saat start tracking → simpan `{ trackingId, startedAt, trackPath }` ke `localStorage`
- Saat GPS update → update `trackPath` di localStorage (setiap 5 titik)
- Saat reload → cek `tugas.status === 'in_progress'` → GET `/tracking/active/:id` → restore
- **Backend `startTime` adalah sumber kebenaran untuk timer**, bukan localStorage
- Saat stop → `localStorage.removeItem()`

### 9. Warna Per Petugas
- Hash deterministik dari NIPP → HSL hue (golden angle × 137°)
- Fungsi `petugasColor(nipp)` ada di `AdminMap.tsx` dan `admin/page.tsx`
- Sama NIPP = sama warna, selalu konsisten

### 10. Z-Index Strategy (Leaflet vs Modal)
- Leaflet internal layers: z-index 200–700
- Modal overlay: `z-[9999]`
- Map container: `isolation: isolate` untuk membuat stacking context terpisah
- **Jangan turunkan z-index modal di bawah 9999**

### 11. Halaman Petugas Tersimpan
- Halaman **dashboard**, **riwayat**, dan **profile** telah **DIHAPUS** dari frontend petugas
- Petugas hanya memiliki flow: Login → `/inspeksi` (task selector) → `/inspeksi/:id` (tracking) → `/inspeksi/:id/selesai` (ringkasan)
- Semua navigasi back/redirect mengarah ke `/inspeksi`, BUKAN `/dashboard`
- AuthGuard `PETUGAS_ROUTES` hanya berisi `['/inspeksi']`

---

## Akun Default

| Role | NIPP | Password |
|------|------|----------|
| Admin | `ADMIN-001` | `admin123` |
| Petugas | `KAI-1234` | `password123` |

---

## Konvensi Kode

### Frontend
- **Bahasa UI**: Campuran Indonesia + Inggris (label Indonesia, variable/function Inggris)
- **CSS**: TailwindCSS dengan design tokens dari `globals.css` (Material Design 3)
- **Font**: Outfit (dari Google Fonts, loaded di layout.tsx)
- **Icon**: Material Symbols Outlined (loaded via CDN di layout.tsx)
- **State management**: useState + useEffect (tidak pakai Redux/Zustand)
- **API calls**: Axios instance dari `lib/api.ts` dengan auto-JWT header
- **Peta**: Dynamic import (`next/dynamic` dengan `ssr: false`) untuk Leaflet
- **Foto**: Base64 encoded string, disimpan di field `Text` di database

### Backend
- **Pattern**: Controller → Route → Middleware
- **ORM**: Prisma (deklaratif, tidak raw SQL kecuali health check)
- **Auth**: JWT di header `Authorization: Bearer <token>`
- **Body limit**: 10MB (`express.json({ limit: '10mb' })`) untuk foto base64
- **Error handling**: try-catch di setiap controller, global error handler di index.ts

---

## Cara Menjalankan

```bash
# Terminal 1 — Backend
cd ppj-kai-backend
npm install
npx prisma db push && npx prisma generate
npx tsx seed-user.ts   # seed data petugas + admin (upsert, aman dijalankan ulang)
npm run dev    # → localhost:5001

# Terminal 2 — Frontend
cd ppj-kai-frontend
npm install
npm run dev    # → localhost:3000
```

> **Setelah perubahan schema Prisma**, jalankan ulang:
> `npx prisma db push && npx prisma generate && npx tsx seed-user.ts`

---

## Tips untuk Agent

1. **JANGAN baca `package-lock.json`** — file ini 1943 baris dan tidak berguna untuk context
2. **JANGAN baca `node_modules/`** — gunakan `package.json` untuk cek dependency
3. **JANGAN baca `tsconfig.json`** kecuali ada error TypeScript config
4. **File terbesar**: `inspeksi/[id]/page.tsx` (~850 baris) dan `admin/page.tsx` (~687 baris) — baca per section, jangan sekaligus
5. **Prisma schema** = sumber kebenaran untuk struktur database
6. **`globals.css`** = semua design tokens (warna, spacing, typography, font sizes)
7. Selalu cek `lib/api.ts` untuk base URL dan interceptor sebelum debug API calls
8. Railway logic ada SEMUA di `lib/railway.ts` — satu file, satu concern. Termasuk `fetchRailwayGeometry()` dan `snapToRailwayPoint()`.
9. **Jangan duplikasi `petugasColor()`** — sudah ada di AdminMap.tsx dan admin/page.tsx, idealnya dipindah ke utils jika perlu di tempat lain
10. **Halaman petugas HANYA `/inspeksi`** — dashboard, riwayat, dan profile sudah DIHAPUS. JANGAN buat halaman baru untuk petugas di luar flow inspeksi.
11. **managerId pattern** — Semua data admin di-scope via `managerId`. Seeder HARUS buat admin dulu, lalu petugas dengan `managerId: admin.id`. Tanpa ini, dashboard admin kosong total.
12. **JWT payload** hanya berisi `{ id, role }` — TIDAK ada `nipp`. Jangan akses `req.user.nipp` dari JWT decoded.
13. **BottomNav** — Hanya berisi item Track (`/inspeksi`). Komponen dari `components/layout/BottomNav.tsx`.
14. **Header halaman petugas** — Selalu centered, hanya teks, style seragam. Lihat bagian "Header Konsisten" di atas.
15. **Overpass API** — JANGAN hardcode 1 endpoint. Selalu pakai `fetchOverpass()` dari `railway.ts` yang punya failover 3 mirror.
16. **Geometry cache** — AdminMap cache geometry di `useRef`. Jangan cache hasil kosong agar bisa retry.
17. **Semua redirect petugas** → `/inspeksi`. JANGAN redirect ke `/dashboard` (sudah tidak ada).
