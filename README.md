# 🚆 KAI RailTrack PPJ

**Sistem Monitoring Inspeksi Jalur Rel Kereta Api** — Aplikasi web untuk manajemen dan pelacakan inspeksi jalur Penilik Perjalan Jalan (PPJ) PT Kereta Api Indonesia.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express)
![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?logo=leaflet)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&logoColor=white)

---

## 📋 Deskripsi

KAI RailTrack PPJ adalah prototipe aplikasi web yang digunakan untuk:

- **Petugas Lapangan (PPJ)** — Melakukan inspeksi jalur rel dengan pelacakan GPS real-time, membuat laporan temuan/darurat, dan mengirimkan bukti foto langsung dari lokasi.
- **Admin** — Menugaskan petugas ke segmen jalur rel tertentu, memonitor status inspeksi secara live di peta, dan melihat laporan darurat beserta lokasi koordinatnya.

### Fitur Utama

| Modul | Fitur |
|-------|-------|
| 🔐 **Autentikasi** | Login berbasis NIPP + JWT, role-based access (admin/petugas) |
| 📍 **GPS Tracking** | Pelacakan posisi real-time saat inspeksi, visualisasi jalur yang sudah dilalui |
| 🗺️ **Peta Interaktif** | Visualisasi jalur rel, live PPJ aktif, serta titik lokasi admin melalui klik peta, input koordinat manual, marker geser, atau pencarian lokasi |
| 🚧 **Geofencing** | Petugas hanya bisa mulai inspeksi jika berada dalam radius 500m dari titik awal |
| 📸 **Verifikasi Selfie** | Foto verifikasi identitas sebelum memulai inspeksi |
| 🚨 **Laporan Darurat** | Kirim temuan ringan/berat/darurat disertai foto dan koordinat GPS |
| 🎯 **Penugasan Admin** | Klik titik di peta → snap ke rel terdekat (Overpass API) → assign ke petugas |
| 🎨 **Warna Per Petugas** | Setiap petugas mendapat warna unik secara otomatis di peta admin |
| 💾 **Session Persistence** | Tracking berlanjut otomatis setelah reload/keluar halaman |
| 🧪 **Mode Testing** | Bypass geofencing di localhost untuk pengujian tanpa perlu ke lokasi |

---

## 🏗️ Arsitektur

```
┌────────────────────────┐     REST API      ┌────────────────────────┐
│                        │   (JSON + JWT)     │                        │
│   ppj-kai-frontend     │ ◄──────────────►   │   ppj-kai-backend      │
│   Next.js 14           │   Port 3000        │   Express 5            │
│   TailwindCSS          │                    │   Prisma ORM           │
│   Leaflet Maps         │                    │   MySQL                │
│                        │                    │                        │
└────────────────────────┘                    └────────────────────────┘
                                                       │
                                              ┌────────┴────────┐
                                              │   MySQL (ppjkai) │
                                              │   Port 3306      │
                                              └─────────────────┘
```

---

## 📁 Struktur Project

```
PROJECT PPJ KAI - PROTOTYPE/
├── ppj-kai-frontend/            # Frontend (Next.js 14)
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/           # Halaman login
│   │   │   ├── inspeksi/        # Tracking & inspeksi
│   │   │   └── admin/           # Dashboard admin
│   │   ├── components/
│   │   │   └── map/             # DynamicMap, AdminMap
│   │   └── lib/
│   │       ├── api.ts           # Axios instance
│   │       └── railway.ts       # Overpass API + Dijkstra pathfinding
│   └── public/
│       └── manifest.json        # PWA manifest
│
├── ppj-kai-backend/             # Backend (Express 5)
│   ├── prisma/
│   │   └── schema.prisma        # Database schema
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── tugas.controller.ts
│   │   │   ├── tracking.controller.ts
│   │   │   ├── laporan.controller.ts
│   │   │   └── admin.controller.ts
│   │   ├── middleware/
│   │   │   └── auth.middleware.ts  # JWT + requireAdmin
│   │   ├── routes/
│   │   └── index.ts               # Entry point
│   ├── seed-user.ts               # Data seeder
│   └── .env                       # Environment config
│
└── README.md
```

---

## ⚙️ Prasyarat

- **Node.js** ≥ 18
- **MySQL** ≥ 8.0
- **npm** atau **yarn**

---

## 🚀 Instalasi & Menjalankan

### 1. Clone Repository

```bash
git clone <repository-url>
cd "PROJECT PPJ KAI - PROTOTYPE"
```

### 2. Setup Backend

```bash
cd ppj-kai-backend

# Install dependencies
npm install

# Buat file .env (sesuaikan dengan konfigurasi database Anda)
cat > .env << EOF
DATABASE_URL="mysql://root:@localhost:3306/ppjkai"
PORT=5001
JWT_SECRET="ppj-kai-secret-key-development"
GEOCODING_API_URL="https://nominatim.openstreetmap.org/search"
APP_URL="http://localhost:3000"
EOF

# Buat database MySQL
mysql -u root -e "CREATE DATABASE IF NOT EXISTS ppjkai"

# Jalankan migrasi Prisma
npx prisma db push

# Generate Prisma Client
npx prisma generate

# Seed data awal (user petugas + admin)
npx tsx seed-user.ts

# Jalankan server
npm run dev
```

Backend akan berjalan di **http://localhost:5001**

### 3. Setup Frontend

```bash
cd ppj-kai-frontend

# Install dependencies
npm install

# Jalankan development server
npm run dev
```

Frontend akan berjalan di **http://localhost:3000**

---

## 🔑 Akun Default

| Role | NIPP | Password |
|------|------|----------|
| Admin | `ADMIN-001` | `admin123` |
| Petugas | `KAI-1234` | `password123` |

---

## 📡 API Endpoints

Base URL: `http://localhost:5001/api`

### Authentication
| Method | Endpoint | Deskripsi | Auth |
|--------|----------|-----------|------|
| `POST` | `/auth/login` | Login dengan NIPP + password | ❌ |
| `GET` | `/auth/check/:nipp` | Cek ketersediaan NIPP | ❌ |
| `GET` | `/auth/me` | Get current user info | ✅ |

### Tugas (Petugas)
| Method | Endpoint | Deskripsi | Auth |
|--------|----------|-----------|------|
| `GET` | `/tugas` | List tugas milik petugas | ✅ |
| `GET` | `/tugas/summary` | Ringkasan statistik tugas | ✅ |
| `GET` | `/tugas/:id` | Detail tugas by ID | ✅ |

### Tracking
| Method | Endpoint | Deskripsi | Auth |
|--------|----------|-----------|------|
| `GET` | `/tracking/active/:tugasId` | Cek tracking session aktif | ✅ |
| `POST` | `/tracking/start/:tugasId` | Mulai tracking inspeksi | ✅ |
| `POST` | `/tracking/update/:id` | Update posisi GPS | ✅ |
| `POST` | `/tracking/stop/:id` | Hentikan tracking | ✅ |

### Laporan
| Method | Endpoint | Deskripsi | Auth |
|--------|----------|-----------|------|
| `POST` | `/laporan` | Buat laporan temuan/darurat | ✅ |
| `GET` | `/laporan` | List laporan milik petugas | ✅ |

### Admin (khusus role admin)
| Method | Endpoint | Deskripsi | Auth |
|--------|----------|-----------|------|
| `GET` | `/admin/stats` | Statistik dashboard | ✅🔒 |
| `GET` | `/admin/petugas` | List semua petugas | ✅🔒 |
| `GET` | `/admin/tugas` | List semua tugas | ✅🔒 |
| `POST` | `/admin/tugas` | Buat tugas baru | ✅🔒 |
| `DELETE` | `/admin/tugas/:id` | Hapus tugas | ✅🔒 |
| `GET` | `/admin/emergency` | List semua laporan darurat | ✅🔒 |

> ✅ = Memerlukan JWT token | 🔒 = Khusus role admin

---

## 🗄️ Database Schema

```
┌──────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐
│  users   │────<│ tugas_ppj │────<│ tracking │────<│ laporan  │
│          │  1:N│           │  1:N│          │  1:N│          │
│ id       │     │ id        │     │ id       │     │ id       │
│ nipp     │     │ jalur     │     │ tugasId  │     │trackingId│
│ nama     │     │ tanggal   │     │ startTime│     │jenisTemuan│
│ password │     │ startLat  │     │ endTime  │     │ deskripsi│
│ foto     │     │ startLong │     │ startLat │     │ foto     │
│ role     │     │ endLat    │     │ startLong│     │ latitude │
│          │     │ endLong   │     │ endLat   │     │ longitude│
│          │     │ status    │     │ endLong  │     │          │
│          │     │ assignedTo│     │ durasi   │     │          │
│          │     │ startName │     │ status   │     │          │
│          │     │ endName   │     │          │     │          │
└──────────┘     └───────────┘     └──────────┘     └──────────┘
```

---

## 🔧 Teknologi

### Frontend
| Teknologi | Versi | Fungsi |
|-----------|-------|--------|
| Next.js | 14 | React framework + SSR |
| TailwindCSS | 3.4 | Utility-first CSS |
| Leaflet | 1.9 | Peta interaktif |
| Axios | 1.16 | HTTP client |
| TypeScript | 5.x | Type safety |

### Backend
| Teknologi | Versi | Fungsi |
|-----------|-------|--------|
| Express | 5 | Web framework |
| Prisma | 5.20 | ORM + migration |
| MySQL | 8+ | Database |
| JWT | 9.x | Authentication token |
| bcryptjs | 3.x | Password hashing |
| TypeScript | 6.x | Type safety |

### Integrasi Eksternal
| Layanan | Fungsi |
|---------|--------|
| OpenStreetMap Tile | Base map layer |
| Overpass API | Query geometri jalur rel dari OSM |
| Browser Geolocation API | GPS tracking real-time |
| Browser Camera API | Foto verifikasi & laporan darurat |

---

## 🗺️ Fitur Peta Detail

### Overpass API + Dijkstra Pathfinding
Garis jalur rel pada peta **mengikuti geometri rel yang sesungguhnya** dari OpenStreetMap, bukan garis lurus:

1. Query Overpass API untuk `way[railway]` dalam bounding box antara titik A dan B
2. Bangun graph dari semua node rel (adjacency list)
3. Jalankan Dijkstra shortest path dari node terdekat A ke node terdekat B
4. Gambar polyline mengikuti path yang ditemukan

### Railway Snap
Saat admin memilih titik di peta, klik **otomatis di-snap ke jalur rel terdekat** (radius 300m). Titik di luar area rel akan ditolak.

### Warna Per Petugas
Setiap petugas mendapat warna unik menggunakan **hash deterministik dari NIPP** (golden angle HSL distribution). Warna konsisten di semua refresh.

---

## 🧪 Mode Testing

Di localhost, halaman inspeksi menampilkan toggle **"Mode Testing"** yang:
- Bypass batasan geofencing 500m
- Memungkinkan start tracking dari lokasi manapun
- **Tidak muncul di production**

---

## 📝 Catatan Development

- **Body size limit**: 10MB (untuk upload foto base64)
- **Geofencing radius**: 500 meter dari titik awal tugas
- **GPS path persistence**: Disimpan di localStorage, timer di-restore dari backend `startTime`
- **Overpass API**: Memerlukan koneksi internet, response time 1-3 detik
- **Z-Index strategy**: Modal menggunakan `z-[9999]` + `isolation: isolate` pada container peta untuk mengatasi layering Leaflet

---

## 📄 Lisensi

Proyek ini dikembangkan sebagai prototipe untuk keperluan internal PT Kereta Api Indonesia.
