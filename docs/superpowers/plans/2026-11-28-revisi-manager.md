# Revisi Manager KAI 27-11-2026 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyelesaikan 7 poin revisi manager: import tanpa dobel/bentrok, live tracking bergerak, overlay peta bisa diminimalkan di HP, menu aksi PPJ + Kendala PPJ, laporan warning untuk QC, penanganan layar mati (tahap web), dan tanda tangan online di PDF.

**Architecture:** Perubahan kecil per area di backend Express/Prisma dan frontend Next.js yang sudah ada. Dua migrasi additive (link warning→tracking, kolom tanda tangan). Tracking latar belakang sejati (APK Capacitor) adalah tahap 2 dengan plan terpisah.

**Tech Stack:** Next.js 16 / React 19, Express 5, Prisma 5, MySQL 8, node:test + tsx, pdfmake, Leaflet.

**Spec:** `docs/superpowers/specs/2026-11-28-revisi-manager-design.md`

## Global Constraints
- Ikuti AGENTS.md: bypass (`TRACKING_BYPASS_ENABLED`, `NEXT_PUBLIC_TRACKING_BYPASS_ENABLED`) tidak diubah; transaksi/claim bersyarat dipertahankan; scope admin/KUPT = managerId, QC = stasiun wilayah.
- Tampilan & navigasi Super Admin tidak didesain ulang; hanya tambahan minimal yang diminta.
- Migrasi hanya additive, nama folder `prisma/migrations/2026112813xxxx_<nama>`; backup DB lokal sebelum `prisma migrate deploy`.
- Teks UI berbahasa Indonesia.
- Jangan commit/push kecuali pemilik proyek meminta; kerja di branch, PR ke main. Langkah "Commit" di bawah = siapkan commit saat diizinkan.
- Verifikasi akhir: `npm run verify` di root; integrasi `npm run test:db` hanya ke DB `ppj_audit*` di 127.0.0.1.

## Review Focus
1. Dua admin mengimpor file yang sama bersamaan → hanya satu set tugas tercipta (Task 1, test integrasi).
2. Tugas dengan `jamSelesai` kosong vs tugas lain di hari sama → dianggap sampai 23:59, bentrok ditolak (Task 1, unit test).
3. Sampel GPS akurasi 21–100 m → marker bergerak tetapi kecepatan tetap "—" dan tidak memicu event kecepatan (Task 2, unit test).
4. Laporan dengan key kategori sembarang yang tidak terdaftar tetap ditolak setelah `kendala_ppj` diizinkan (Task 4, unit test).
5. Tanda tangan bukan PNG / terlalu besar / kosong ditolak server; data lama tanpa tanda tangan tetap menghasilkan PDF (Task 6, unit test).

---

### Task 1: Import & penugasan manual tanpa dobel dan tanpa jadwal bentrok

**Files:**
- Modify: `ppj-kai-backend/src/utils/assignmentValidation.ts` (tambah fungsi murni)
- Modify: `ppj-kai-backend/src/lib/taskGuards.ts` (tambah lock + query overlap)
- Modify: `ppj-kai-backend/src/controllers/import.controller.ts:281-312`
- Modify: `ppj-kai-backend/src/controllers/assignment.controller.ts:135-160`
- Test: `ppj-kai-backend/src/utils/auditRegression.test.ts` (unit), `ppj-kai-backend/test/workflow.test.ts` (integrasi)

**Interfaces:**
- Produces: `schedulesOverlap(a: {jamMulai: string; jamSelesai: string | null}, b: {jamMulai: string | null; jamSelesai: string | null}): boolean` — interval `[mulai, selesai ?? '23:59')`; `b.jamMulai` null (data lama) dianggap seharian.
- Produces: `lockPetugas(tx: Prisma.TransactionClient, petugasId: number): Promise<void>` — `SELECT id FROM users WHERE id = ? FOR UPDATE`.
- Produces: `findOverlappingAssignment(db: Db, task: {assignedTo: number; tanggal: Date; jamMulai: string; jamSelesai: string | null; excludeId?: number}): Promise<{id: number; jalur: string; jamMulai: string | null; jamSelesai: string | null} | null>` — ambil tugas PPJ itu pada tanggal sama dengan status bukan `cancelled`/`missed`, filter dengan `schedulesOverlap`.

- [ ] **Step 1: Tulis unit test gagal** di `auditRegression.test.ts`:
```ts
test('schedulesOverlap: PPJ yang sama tidak boleh punya jam tumpang tindih', () => {
  assert.equal(schedulesOverlap({ jamMulai: '08:00', jamSelesai: '10:00' }, { jamMulai: '09:00', jamSelesai: '11:00' }), true);
  assert.equal(schedulesOverlap({ jamMulai: '08:00', jamSelesai: '10:00' }, { jamMulai: '10:00', jamSelesai: '12:00' }), false);
  assert.equal(schedulesOverlap({ jamMulai: '13:00', jamSelesai: null }, { jamMulai: '20:00', jamSelesai: '21:00' }), true);
  assert.equal(schedulesOverlap({ jamMulai: '08:00', jamSelesai: '09:00' }, { jamMulai: null, jamSelesai: null }), true);
});
```
- [ ] **Step 2:** `cd ppj-kai-backend && npm test` → FAIL (`schedulesOverlap` tidak ada).
- [ ] **Step 3:** Implementasi `schedulesOverlap` (bandingkan string `HH:mm`), `lockPetugas`, `findOverlappingAssignment`.
- [ ] **Step 4:** Di import: dalam `$transaction`, panggil `lockPetugas(tx, petugas.id)` **pertama**, lalu `findDuplicateAssignment`, lalu `findOverlappingAssignment` → `throw new Error('SCHEDULE_CONFLICT')` dengan data tugas bentrok. Pesan baris: `Jadwal bentrok dengan tugas "<jalur>" pukul <mulai>–<selesai|selesai hari> untuk NIPP "<nipp>"`. Tambahkan `SCHEDULE_CONFLICT` ke daftar error yang tidak di-log.
- [ ] **Step 5:** Di penugasan manual (`assignment.controller.ts`): bungkus cek duplikat + create dalam `prisma.$transaction` dengan urutan yang sama; bentrok → 409 dengan pesan yang sama. Edit tugas (jika ada endpoint update jadwal) memakai `excludeId`.
- [ ] **Step 6: Test integrasi** di `test/workflow.test.ts` (pola fixture yang ada): `real MySQL: dua import bersamaan file sama hanya membuat satu tugas` — `Promise.all` dua POST `/api/admin/tugas/import` dengan buffer xlsx satu baris (buat dengan `xlsx` util yang dipakai `downloadTugasTemplate`), lalu `assert.equal(await prisma.tugasPpj.count({ where: { assignedTo: ppj.id } }), 1)`; dan baris kedua dengan jam overlap → `details[0].message` mengandung `Jadwal bentrok`.
- [ ] **Step 7:** `npm test && npm run typecheck` PASS; `npm run test:db` PASS pada DB ppj_audit.
- [ ] **Step 8: Commit** `fix(import): kunci PPJ per transaksi dan tolak jadwal bentrok`

### Task 2: Posisi live bergerak walau GPS kurang akurat, dan status update jujur

**Files:**
- Modify: `shared/telemetry.ts` (konstanta + `advanceSpeed`)
- Modify: `ppj-kai-frontend/src/hooks/useLivePositions.ts`
- Modify: `ppj-kai-frontend/src/components/map/AdminMap.tsx` (marker basi)
- Modify: `ppj-kai-frontend/src/app/admin/page.tsx:1218-1222`, `ppj-kai-frontend/src/app/qc/page.tsx:393-398` (badge Live Sync)
- Test: `ppj-kai-backend/src/utils/telemetry.test.ts`

**Interfaces:**
- Produces: `TELEMETRY.MAX_POSITION_ACCURACY_M = 100`; `TELEMETRY.TRACKING_SYNC_INTERVAL_MS = 5000`; `TELEMETRY.LIVE_POLL_INTERVAL_MS = 5000`.
- Produces: `useLivePositions(enabled)` → `{ positions, error, lastUpdatedAt: number | null }`.
- Produces: `components/map/LiveStatusBadge.tsx` default export `LiveStatusBadge({ lastUpdatedAt, error }: { lastUpdatedAt: number | null; error: string })` — teks `Diperbarui HH:MM:SS`, titik hijau bila ≤ 15 s, kuning bila lebih lama, merah bila `error`.

- [ ] **Step 1: Unit test gagal** di `telemetry.test.ts`:
  - `poor-accuracy sample still moves the live position`: setelah 1 sampel bagus, kirim sampel akurasi 45 m 5 s kemudian → `state.position.id === thatSample.id`, `state.speedKmh === null`, `quality === 'poor_accuracy'`.
  - `sample beyond 100 m accuracy does not move the position`: akurasi 150 → `state.position.id` tetap id sampel sebelumnya.
  - Periksa test lama di baris 68–69 (`sample(45,300)` mengembalikan state yang sama) — itu kasus sampel terlambat; pastikan tetap lulus.
- [ ] **Step 2:** `npm test` di backend → FAIL.
- [ ] **Step 3:** Di `advanceSpeed`, cabang `poor_accuracy`: jika `sample.accuracy <= MAX_POSITION_ACCURACY_M` set `state.position = sample` sebelum `clear('poor_accuracy')`. Cabang stale/future/jump tidak berubah. Ubah kedua interval ke 5000.
- [ ] **Step 4:** `npm test` (backend & frontend) PASS — server `lib/telemetry.ts:84-85` sudah memakai `state.position` sehingga `endLat/endLong` ikut bergerak tanpa perubahan.
- [ ] **Step 5:** `useLivePositions` simpan `lastUpdatedAt = Date.now()` saat sukses. Ganti badge statis "Live Sync" di admin dan QC dengan `LiveStatusBadge` (posisi & kelas wadah sama).
- [ ] **Step 6:** `AdminMap`: marker dengan `positionCapturedAt` lebih tua dari `TELEMETRY.GPS_GAP_MS` digambar abu-abu tanpa animasi pulse dan tooltip menambah `GPS terputus sejak HH:MM`.
- [ ] **Step 7:** Verifikasi browser: jalankan backend+frontend lokal, buka /inspeksi/[id] dengan bypass dan lokasi emulasi berubah (DevTools sensors) akurasi 40 m; di /admin liveview marker berpindah ≤ ~15 s. Screenshot.
- [ ] **Step 8: Commit** `fix(live): posisi bergerak pada GPS lemah dan badge waktu update`

### Task 3: Overlay peta bisa diminimalkan di HP

**Files:**
- Create: `ppj-kai-frontend/src/components/map/CollapsiblePanel.tsx`
- Modify: `ppj-kai-frontend/src/components/map/AdminMap.tsx:236-240`, `ppj-kai-frontend/src/app/admin/page.tsx:1200-1215`, `ppj-kai-frontend/src/app/qc/page.tsx:399-425`

**Interfaces:**
- Produces: `CollapsiblePanel({ title, icon, children, className }: { title: string; icon: string; children: ReactNode; className?: string })` — di layar `< 768px` (`matchMedia('(max-width: 767px)')`) awalnya tertutup dan tampil sebagai tombol bulat 40 px (ikon material) dengan `aria-expanded`; di desktop terbuka. Tombol tutup (`expand_more`) selalu ada saat terbuka. Status tidak disimpan.

- [ ] **Step 1:** Buat komponen.
- [ ] **Step 2:** Bungkus `LiveSpeedList` (`title="Monitoring kecepatan"`, `icon="speed"`) dan kedua blok "Legenda Visual" (`icon="legend_toggle"`). Isi dan gaya panel di desktop tidak berubah.
- [ ] **Step 3:** `npm run typecheck && npm run lint` di frontend PASS.
- [ ] **Step 4:** Verifikasi browser di 375×812 dan desktop: di HP keduanya tertutup dan peta terlihat penuh; tap membuka/menutup; desktop sama seperti sebelumnya. Screenshot keduanya.
- [ ] **Step 5: Commit** `feat(map): panel kecepatan dan legenda dapat diminimalkan di HP`

### Task 4: Menu aksi inspeksi + Kendala PPJ

**Files:**
- Modify: `shared/display.ts` (konstanta)
- Modify: `ppj-kai-backend/src/controllers/laporan.controller.ts:40-47`
- Create: `ppj-kai-frontend/src/components/inspeksi/ActionMenu.tsx`, `ppj-kai-frontend/src/components/inspeksi/KendalaModal.tsx`
- Modify: `ppj-kai-frontend/src/app/inspeksi/[id]/page.tsx:722-735` (ganti dua FAB)
- Modify: tampilan label jenis laporan di admin/QC (cari pemakaian label kategori dari `jenisTemuan`) agar `kendala_ppj` → "Kendala PPJ"
- Test: `ppj-kai-backend/src/controllers/ppjGuards.test.ts` (pola stub seperti `warning.test.ts`)

**Interfaces:**
- Produces: `KENDALA_PPJ_KEY = 'kendala_ppj'`, `KENDALA_PPJ_LABEL = 'Kendala PPJ'`, `KENDALA_REASONS = ['Sakit / kondisi fisik', 'HP / baterai bermasalah', 'Cuaca / kondisi jalur', 'Lainnya'] as const` di `shared/display.ts`.
- Produces: `ActionMenu({ onAlertKereta, onLaporanDarurat, onKendala, sendingAlert, gpsReady }: {...})` — satu FAB "Aksi" (posisi kanan bawah, `bottom-[180px]`) membuka bottom sheet berisi 4 item: Alert Kereta (biru, `campaign`), Laporan Darurat / Warning (merah, `warning`), Kendala PPJ (oranye, `report`), Ganti PPJ (non-aktif, label "Segera hadir"). Tutup via backdrop / Escape.
- Produces: `KendalaModal({ open, onClose, onSubmit })` — pilih alasan (wajib) + catatan (opsional, ≤ 500 karakter); `onSubmit(reason, note)`.
- Consumes: `POST /laporan` lama dengan `jenisTemuan: KENDALA_PPJ_KEY`, `deskripsi: \`${reason}${note ? ': ' + note : ''}\``.

- [ ] **Step 1: Unit test gagal:** `createLaporan menerima kendala_ppj tanpa baris kategori` (stub `kategoriTemuan.findUnique` → null, harapkan 201) dan `createLaporan tetap menolak key tak terdaftar` (key `asal`, harapkan 400).
- [ ] **Step 2:** `npm test` → FAIL pada test pertama.
- [ ] **Step 3:** Di controller, lewati cek kategori hanya bila `jenisTemuan.trim() === KENDALA_PPJ_KEY`. Pastikan `reportSeverity` memperlakukannya sebagai bukan darurat (default).
- [ ] **Step 4:** `npm test` PASS.
- [ ] **Step 5:** Buat `ActionMenu` dan `KendalaModal`; ganti dua FAB di halaman inspeksi. Handler lama (`handleSendNearbyWarning`, `setIsEmergencyModalOpen(true)`) dipakai ulang; Kendala memanggil `/laporan` dengan lokasi GPS terakhir (atau lokasi perkiraan seperti alur laporan darurat bila GPS belum ada).
- [ ] **Step 6:** Label "Kendala PPJ" muncul di daftar insiden admin/QC dan tooltip peta.
- [ ] **Step 7:** Verifikasi browser 375 px: menu terbuka, ketiga aksi aktif berfungsi, Ganti PPJ non-aktif; laporan kendala tampil di admin.
- [ ] **Step 8: Commit** `feat(inspeksi): menu aksi dan laporan kendala PPJ`

### Task 5: Laporan warning untuk QC

**Files:**
- Create: `ppj-kai-backend/prisma/migrations/20261128130000_warning_tracking/migration.sql`
- Modify: `ppj-kai-backend/prisma/schema.prisma` (model `WarningAlert`, `Tracking`)
- Modify: `ppj-kai-backend/src/controllers/tracking.controller.ts` (`createNearbyWarning` isi `trackingId`)
- Create: `ppj-kai-backend/src/controllers/warningReport.controller.ts`
- Modify: `ppj-kai-backend/src/routes/admin.routes.ts` (route baru)
- Create: `ppj-kai-frontend/src/components/qc/WarningReportPanel.tsx`
- Modify: `ppj-kai-frontend/src/app/qc/page.tsx` (tombol header + panel)
- Test: `ppj-kai-backend/test/qc.test.ts`

**Interfaces:**
- Schema: `WarningAlert.trackingId Int? @map("tracking_id")`, relasi `tracking Tracking? @relation(fields: [trackingId], references: [id], onDelete: SetNull)`, `@@index([trackingId])`; SQL: `ALTER TABLE warning_alerts ADD COLUMN tracking_id INT NULL`, index, FK `ON DELETE SET NULL`.
- Produces: `GET /api/admin/warnings?days=1|7|30` (default 7), `requireAuth, requireAdminLike`. Scope: QC → `startPointName` atau `endPointName` ada di stasiun wilayahnya (`getStationsForUser`); admin/KUPT → `creator.managerId = userId`. Respons `data: { id, createdAt, startPointName, endPointName, creator: { nama, nipp }, jalur: string | null, recipients: { nama, nipp }[] }[]`, urut terbaru, maks 500.
- Produces: `WarningReportPanel({ open, onClose })` — drawer kanan (penuh di HP), filter periode 1/7/30 hari, kartu per warning: waktu WIB, pengirim, jalur/arah, jumlah & nama penerima, tombol "Lihat di peta" bila dipakai.

- [ ] **Step 1:** Backup DB lokal; tulis migrasi + schema; `npx prisma migrate deploy && npx prisma generate` pada DB lokal.
- [ ] **Step 2: Test integrasi gagal** `real MySQL: QC hanya melihat warning di stasiun wilayahnya` — buat dua `warningAlert` (Sta. Jenar dan stasiun di luar wilayah), GET sebagai QC → panjang 1, `creator.nipp` sesuai; sebagai admin pengelola → melihat milik PPJ kelolaannya.
- [ ] **Step 3:** Implementasi controller + route; `createNearbyWarning` menyimpan `trackingId: activeTracking.id`.
- [ ] **Step 4:** `npm run test:db` PASS, `npm test && npm run typecheck` PASS (perbarui stub `warning.test.ts` bila assert `create` data).
- [ ] **Step 5:** Panel QC + tombol header "Warning" (ikon `campaign`) dengan jumlah 24 jam terakhir.
- [ ] **Step 6:** Verifikasi browser sebagai QC: kirim warning dari sesi PPJ uji, muncul di panel.
- [ ] **Step 7: Commit** `feat(qc): laporan warning penugasan PPJ`

### Task 6: Tanda tangan online di laporan PDF

**Files:**
- Create: `ppj-kai-backend/prisma/migrations/20261128140000_tracking_signatures/migration.sql`
- Modify: `ppj-kai-backend/prisma/schema.prisma` (`Tracking.ttdPetugas String? @map("ttd_petugas") @db.LongText`, `Tracking.ttdApprover String? @map("ttd_approver") @db.LongText`)
- Create: `ppj-kai-backend/src/lib/signature.ts`, test `ppj-kai-backend/src/lib/signature.test.ts`
- Modify: `ppj-kai-backend/src/controllers/tracking.controller.ts` (`stopTracking`, `approveTracking`), `ppj-kai-backend/src/lib/inspectionReport.ts:495-515` + sumber `ReportInput`
- Create: `ppj-kai-frontend/src/components/common/SignaturePad.tsx`
- Modify: `ppj-kai-frontend/src/app/inspeksi/[id]/page.tsx` (lembar selesai), `ppj-kai-frontend/src/app/admin/page.tsx:670-690` + dialog setujui di `TaskDetailModal.tsx:219`
- Test: `ppj-kai-backend/src/lib/inspectionReport.test.ts`

**Interfaces:**
- Produces: `parseSignature(value: unknown): { ok: true; value: string } | { ok: false; message: string }` — hanya `data:image/png;base64,...`, panjang ≤ 200_000 karakter, base64 valid; pesan `Tanda tangan tidak valid`.
- Produces: `SignaturePad({ onChange, height }: { onChange: (dataUrl: string | null) => void; height?: number })` — canvas pointer events (mouse/sentuh), garis 2 px gelap di latar putih, tombol "Hapus"; `onChange(null)` bila kosong; ekspor PNG skala ≤ 600 px lebar.
- Backend: `POST /tracking/stop/:id` menerima `ttdPetugas` — wajib kecuali `bypassMode` diterima; `POST /admin/tracking/:id/approve` menerima `ttdApprover` wajib. Disimpan di dalam transaksi claim yang sudah ada.
- PDF: `ReportInput.tracking.ttdPetugas?: string | null`, `ttdApprover?: string | null`; `signer()` menggambar `{ image, fit: [140, 50] }` di atas nama bila ada, ruang kosong 50 pt bila tidak.

- [ ] **Step 1:** Backup DB lokal; migrasi + schema; `migrate deploy && generate`.
- [ ] **Step 2: Unit test gagal** `signature.test.ts`: PNG valid → ok; `data:image/jpeg` → gagal; string 200_001 karakter → gagal; `''`/`null` → gagal. `inspectionReport.test.ts`: dengan `ttdPetugas` → dokumen berisi node `image` di blok pengesahan; tanpa → tidak ada image dan build tidak error.
- [ ] **Step 3:** `npm test` → FAIL.
- [ ] **Step 4:** Implementasi `parseSignature`, validasi di stop/approve (400 bila tidak valid/kurang), simpan, teruskan ke `ReportInput`, render di `signer()`.
- [ ] **Step 5:** `npm test && npm run typecheck` PASS; perbarui test controller yang memanggil stop/approve (`reviewFlow.test.ts`, `warning.test.ts`) agar menyertakan tanda tangan.
- [ ] **Step 6:** Frontend: `SignaturePad` di lembar selesai PPJ (tombol selesai non-aktif sampai ada tanda tangan, kecuali mode uji) dan di dialog setujui admin/KUPT (tambahan minimal, tata letak admin tetap).
- [ ] **Step 7:** Verifikasi end-to-end lokal: selesai inspeksi bypass → setujui → unduh PDF; dua tanda tangan tampil. Simpan PDF ke `hasil-uji-laporan/laporan-ttd-online.pdf`.
- [ ] **Step 8: Commit** `feat(laporan): tanda tangan online PPJ dan penyetuju`

### Task 7: Layar mati / minimize — tahap web

Wake Lock sudah ada (`TelemetryCard.tsx:76-94`). Tahap ini membuat putusnya terlihat dan PPJ diingatkan; tidak membuat GPS jalan di latar belakang.

**Files:**
- Create: `ppj-kai-frontend/src/hooks/useBackgroundGap.ts`
- Modify: `ppj-kai-frontend/src/app/inspeksi/[id]/page.tsx` (dialog sebelum mulai + banner kembali)
- Test: `ppj-kai-frontend/test/regression.test.ts`

**Interfaces:**
- Produces: `useBackgroundGap(active: boolean): { lastGapMs: number | null; dismiss: () => void }` — catat waktu saat `visibilitychange` → hidden; saat visible lagi hitung selisih; set `lastGapMs` bila ≥ 30_000. Logika hitung dipisah sebagai `gapOnReturn(hiddenAt: number | null, now: number, minMs = 30_000): number | null` agar bisa dites.

- [ ] **Step 1: Unit test gagal** `gapOnReturn`: `(null, 1000)` → null; `(0, 29_999)` → null; `(0, 120_000)` → 120000.
- [ ] **Step 2:** `npm test` di frontend → FAIL; implementasi; PASS.
- [ ] **Step 3:** Saat menekan "Mulai Tracking", dialog `showConfirm` sekali: "Selama inspeksi, jangan kunci layar atau pindah aplikasi. Tracking berhenti bila layar mati." — lanjut setelah "Mengerti".
- [ ] **Step 4:** Banner kuning saat kembali: `Tracking sempat terhenti ±N menit karena layar mati atau aplikasi diminimalkan. Jejak pada rentang ini tidak terekam.` dengan tombol tutup. Admin sudah melihat marker abu-abu dari Task 2; PDF sudah mencatat celah GPS (`inspectionReport.ts:466`).
- [ ] **Step 5:** `npm run verify` di root PASS.
- [ ] **Step 6: Commit** `feat(inspeksi): peringatan layar mati dan banner tracking terhenti`

### Tahap 2 (plan terpisah, butuh keputusan pemilik proyek): APK Android
Ringkasan untuk plan berikutnya: proyek `ppj-kai-android/` dengan Capacitor, `server.url` ke domain production, plugin `@capacitor-community/background-geolocation` (foreground service + notifikasi "Inspeksi berjalan"), `useGPS` memakai watcher native bila `Capacitor.isNativePlatform()`, distribusi APK lewat admin. Butuh: konfirmasi distribusi APK ke HP PPJ (Android saja), uji perangkat nyata untuk throttling WebView di latar belakang.

---

## Urutan eksekusi
Task 1 → 2 → 3 → 4 → 5 → 6 → 7. Task 3, 4, 7 menyentuh file berbeda dari 1/5/6 kecuali `inspeksi/[id]/page.tsx` (Task 4, 6, 7) — jalankan berurutan.
