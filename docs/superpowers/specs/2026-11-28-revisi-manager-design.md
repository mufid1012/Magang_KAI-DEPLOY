# Revisi Manager KAI 27-11-2026 — Design

## Intent
Manager KAI mengevaluasi aplikasi di lapangan dan meminta tujuh perbaikan. Tujuannya: monitoring live bisa dipercaya, data penugasan tidak dobel, PPJ punya aksi darurat yang rapi, QC bisa melihat warning, dan laporan bisa ditandatangani tanpa cetak.

## Temuan dari kode
| # | Revisi | Akar masalah / kondisi sekarang |
|---|--------|------|
| 1 | Live admin tidak bergerak | `advanceSpeed` (shared/telemetry.ts:54) membuang sampel akurasi > 20 m sebelum `state.position` diperbarui, jadi marker berhenti di titik bagus terakhir. Latensi sampel 5 s + sync 10 s + poll 10 s. Badge "Live Sync" berkedip walau tidak ada data. |
| 2 | Overlay di HP | `LiveSpeedList` (AdminMap) dan "Legenda Visual" (admin/page.tsx:1200, qc/page.tsx:399) selalu tampil. |
| 3 | Import Excel dobel | Cek duplikat = baca lalu tulis tanpa lock. Terbukti di DB lokal: 2 upload bersamaan → 2 baris. Cek hanya kecocokan persis; jam yang overlap tidak dicek. |
| 4 | Menu aksi inspeksi | Dua FAB: "Alert Kereta" (warning ke PPJ terdekat) dan merah (Laporan Darurat). Belum ada Kendala PPJ. |
| 5 | QC lihat warning | `WarningAlert` tersimpan, tanpa link ke tracking dan tanpa endpoint baca untuk QC. |
| 6 | Layar mati/minimize | Wake Lock sudah ada (TelemetryCard.tsx:76). Browser tetap menghentikan GPS saat layar dikunci/aplikasi pindah. Tidak bisa diatasi dengan web murni. |
| 7 | Tanda tangan online | PDF hanya mencantumkan nama + waktu persetujuan (inspectionReport.ts:510). |
| catatan | Jadwal tidak bertabrakan | Ditafsirkan: satu PPJ tidak boleh punya dua tugas dengan jam overlap; PPJ berbeda boleh di jam sama. |

## Approaches
- **Dobel (3):** (a) unique index DB — gagal migrasi bila production sudah punya dobel, dan tidak menangkap overlap; (b) **lock baris PPJ (`SELECT … FOR UPDATE` pada `users`) di dalam transaksi lalu cek duplikat + overlap** — dipilih: tanpa migrasi, menutup race dan overlap sekaligus, pola sama dengan `lockTracking`.
- **Live (1):** pisahkan "posisi" dari "kecepatan": sampel 20–100 m tetap menggerakkan marker, kecepatan tetap butuh ≤ 20 m. Interval sync & poll 10 s → 5 s.
- **Background (6):** (a) Wake Lock — sudah ada, tidak cukup; (b) trik audio senyap — tidak andal; (c) **APK Android Capacitor yang memuat URL production + plugin background geolocation (foreground service)** — satu-satunya solusi nyata. Dipecah: tahap 1 di web (deteksi & tampilkan putus), tahap 2 APK (plan terpisah setelah dikonfirmasi).
- **Kendala PPJ (4):** laporan dengan key khusus `kendala_ppj` (bukan kategori yang bisa diedit admin) — memakai alur Laporan, daftar insiden, dan penanganan yang sudah ada.
- **Tanda tangan (7):** canvas sendiri (tanpa library) → PNG data URL disimpan di kolom tracking → dimasukkan ke PDF.

## Keputusan (calls saya, bisa dikoreksi)
- Ganti PPJ: hanya item menu non-aktif "Segera hadir".
- Menu aksi: satu FAB "Aksi" membuka bottom sheet (setara dropdown/sidebar di HP).
- Tanda tangan PPJ wajib saat menyelesaikan inspeksi (kecuali mode uji); tanda tangan penyetuju wajib saat menyetujui. Data lama tetap tampil nama saja.
- Laporan warning untuk QC dibatasi stasiun wilayahnya; admin/KUPT lewat endpoint yang sama dibatasi PPJ kelolaan. UI hanya ditambahkan di halaman QC (UI Super Admin tidak didesain ulang).
- Jam selesai kosong dianggap sampai 23:59 untuk cek overlap.

## Non-goals
Fitur ganti PPJ, iOS app, unique index DB, redesign UI admin.

## Constraints
- Migrasi additive saja, backup DB sebelum migrate (docs/MIGRATIONS.md).
- Commit/push hanya bila diminta; branch + PR ke main.
- Bypass flag tetap seperti sekarang.
