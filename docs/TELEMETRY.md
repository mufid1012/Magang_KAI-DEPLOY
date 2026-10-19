# Telemetri kecepatan PPJ

Implementasi pertama ini memperkirakan pergerakan dan menyimpan **indikasi untuk ditinjau**. Tidak dapat membuktikan penggunaan kendaraan, kehadiran orang, atau keaslian GPS. Validasi server tidak membuat GPS browser kebal pemalsuan. Tidak ada penghentian tugas, hukuman, perubahan `safetyStatus`, atau penolakan approval otomatis.

## Aliran data dan konfigurasi

Satu `watchPosition` dipakai bersama dengan validasi start/stop. Browser menentukan frekuensi callback. `maximumAge=5000` membatasi usia cache, bukan interval GPS. Tidak ada timer yang membuat pembacaan GPS baru atau memperbarui timestamp lama. Perhitungan memakai lokasi asli perangkat, bukan posisi yang diproyeksikan ke rel; pemetaan rute yang sudah ada hanya untuk visualisasi.

Konfigurasi terpusat: `shared/telemetry.ts`, objek `TELEMETRY`. Semua angka adalah **parameter awal uji lapangan, bukan standar resmi**.

| Parameter | Nilai awal | Tujuan |
| --- | --- | --- |
| TELEMETRY_SAMPLE_INTERVAL_MS | 5000 ms | Target pemilihan sampel baru; callback lebih jarang tetap diterima |
| TRACKING_SYNC_INTERVAL_MS | 10000 ms | Upload hanya sampel belum diakui, tanpa seluruh rute |
| LIVE_POLL_INTERVAL_MS | 10000 ms | GET posisi/ringkasan ketika monitoring terlihat |
| MAX_ACCURACY_M / MAX_REPORTED_ACCURACY_M | 20 / 100000 m | Kandidat perhitungan / batas validasi payload; tidak menjamin kelayakan |
| WINDOW_MS / MIN_WINDOW_MS | 20000 / 15000 ms | Jendela estimasi beberapa titik |
| MIN_SAMPLES | 4 | Minimum sampel dalam jendela |
| PAIR_MIN_MS | 5000 ms | Minimum selisih waktu pasangan untuk median laju pembatas spike |
| WINDOW_BUCKET_MS | 1000 ms | Maksimal satu titik per bucket detik dalam state perhitungan, agar state tetap terbatas meski callback sangat sering |
| MAX_GAP_MS | 12000 ms | Putus segmen dan rangkaian indikasi setelah gap |
| FRESH_MS / FUTURE_MS | 30000 / 5000 ms | Kedaluwarsa live dan toleransi waktu mendahului server |
| MAX_OFFLINE_MS | 86400000 ms | Sampel diterima lebih dari 24 jam sesudah capture disimpan sebagai expired/before_start, tidak dihitung |
| MAX_SPEED_MPS | 55 m/s | Batas kewajaran device speed dan loncatan koordinat setelah memperhitungkan ketidakpastian |
| DEVICE_TOLERANCE_MPS | 0,75 m/s | Toleransi tambahan konsistensi device speed dengan perpindahan jendela |
| SMOOTHING_ALPHA | 0,5 | EMA ringan per estimasi valid |
| REVIEW_KMH / REVIEW_DURATION_MS | >12 km/jam / 60000 ms | Rangkaian pergerakan cepat berkelanjutan |
| MAX_BATCH / MAX_PAYLOAD_BYTES | 120 / 65536 byte | Batas sampel/request update; foto stop memakai batas lama aplikasi |
| MAX_QUEUE | 1440 sampel | Sekitar dua jam antrean pada target 5 detik |
| REQUEST_TIMEOUT_MS / MAX_BACKOFF_MS | 15000 / 60000 ms | Timeout upload dan batas backoff eksponensial |
| STOP_TIMEOUT_MS | 45000 ms | Anggaran memulai batch flush; request yang sudah berjalan bisa menyelesaikan timeout 15 detiknya |

## Metode dan satuan

`deviceSpeed` disimpan nullable dalam **meter/detik**. Nol valid, null tidak tersedia. Nilai negatif/di atas batas kewajaran tidak dipakai sebagai speed, tetapi tetap tersimpan untuk audit. Nilai non-finite atau tipe salah ditolak. Device speed baru dipakai sesudah tersedia minimal empat sampel berkualitas selama minimal 15 detik dan konsisten dengan perpindahan jendela:

`abs(deviceSpeed - medianLajuPasangan) <= (akurasiAwal + akurasiAkhir)/detik + 0,75`. Median memakai seluruh pasangan dalam jendela dengan selisih waktu minimal lima detik, memilih median bawah bila jumlah pasangan genap.

Fallback memakai jarak haversine antara awal dan akhir jendela, dikurangi jumlah radius ketidakpastian kedua titik, dibatasi minimum nol, lalu dibagi selisih **waktu capture GPS**. Hasil juga dibatasi median bawah laju antarpasangan dalam jendela agar satu endpoint menyimpang yang masih di bawah batas teleport tidak menjadi speed. Tidak menjumlahkan jitter antartitik. Konversi ke km/jam memakai faktor 3,6. Metode sengaja konservatif: berjalan pelan, belokan, balik arah, dan akurasi mendekati 20 m bisa menghasilkan estimasi terlalu rendah. Radius accuracy browser bukan batas kesalahan yang pasti.

EMA `lama + 0,5 × (baru − lama)` mengurangi getaran angka tetapi menunda respons terhadap perubahan. Nilai mentah nol langsung ditampilkan nol sesudah jendela memenuhi syarat agar ekor smoothing tidak mempertahankan kecepatan saat berhenti. Estimasi awal memerlukan sekitar 15–20 detik; saat callback terlalu jarang bisa tidak tersedia. Frekuensi callback lokal dapat membuat transisi smoothing berbeda dari ringkasan server yang memakai sampel pilihan, walaupun util dan aturan sama. Server selalu sumber ringkasan resmi.

Rata-rata = total jarak konservatif segmen valid / total durasi segmen valid × 3,6. Segmen dihitung dengan anchor yang tidak tumpang tindih setelah minimal 15 detik; jaraknya juga dibatasi median laju pasangan × durasi anchor. Jitter di dalam ketidakpastian memberi jarak nol. Gap, data buruk, dan loncatan memutus anchor; tidak dimasukkan sebagai waktu diam. Akhir segmen yang belum cukup panjang tidak ditambahkan. Angka ini bukan rata-rata sederhana callback, bukan jarak rute peta, dan bukan rerata seluruh waktu shift.

Koordinat/accuracy/waktu harus finite, dalam batas yang valid, dan timestamp maju. Sampel kualitas buruk memutus window, anchor, speed dan rangkaian indikasi. Loncatan tunggal melebihi 55 m/s setelah pengurangan ketidakpastian dikarantina; titik tersebut tidak menjadi anchor. Gerakan cepat yang konsisten di bawah batas ini tetap dihitung, bukan dibuang hanya karena di atas 12 km/jam. Gerakan yang jauh lebih cepat dari rentang rancangan menjadi data tidak layak, bukan bukti aktivitas tertentu.

Indikasi memerlukan **nilai mentah, nilai EMA, dan batas bawah kecepatan koordinat** semuanya >12 km/jam secara berkelanjutan selama minimal 60 detik timestamp GPS. Dukungan koordinat konservatif mengurangi indikasi dari device speed salah saat posisi tidak bergerak. Satu spike tidak cukup. Gap, kualitas buruk, dan estimasi tidak memenuhi syarat memutus rangkaian. Waktu awal interval adalah estimasi tinggi pertama yang memenuhi semua syarat, bukan awal jendela pemanasan. Rerata kejadian dibobot durasi antar-estimasi; disimpan bersama awal/akhir, durasi, maksimum, jumlah sampel pendukung, dan accuracy terburuk. Kejadian berjalan diperbarui berdasarkan pasangan sesi/waktu awal, maksimal sekali per interval dalam satu batch.

Label: **“Kecepatan tidak wajar — perlu ditinjau”**. Tidak ada indikasi bukan berarti terbukti berjalan kaki. Sesi bypass start atau stop diberi `telemetryTest=true`; seluruh kejadian sesi tersebut ditandai data uji dan tidak menjadi indikator operasional. Kedua flag bypass dan defaultnya tetap dipertahankan.

## Database, kompatibilitas, dan API

Migrasi additive `20261019150000_tracking_telemetry` menambah:

- `tracking_samples`: identitas sampel, capture/receive time, koordinat asli, accuracy, speed perangkat, kualitas; unique `(tracking_id,sample_id)` dan `(tracking_id,captured_at)` sekaligus indeks waktu per sesi.
- `speed_events`: interval kejadian, ringkasan, kualitas dan flag data uji; unique `(tracking_id,start_at)` untuk update kejadian berjalan dan pembacaan detail.
- Tracking: JSON state terbatas pada jendela terakhir/anchor/ringkasan, flag uji, metadata jumlah kehilangan yang dilaporkan client, capture time dan accuracy posisi terakhir yang benar-benar dipakai monitoring.

FK kedua tabel baru `ON DELETE CASCADE` ke Tracking sehingga alur hapus tracking/akun yang ada tetap bekerja. Tidak ada penghapusan historis otomatis, seeder, reset, atau migrasi database produksi dalam pengerjaan fitur ini. `routePath` tetap JSON `[[lat,lng], ...]`; map, PDF, dan API lama tetap didukung. Data tanpa timestamp menghasilkan speed/rerata tidak tersedia, tidak direkonstruksi dari rute lama.

Deploy dengan prosedur backup/staging dan baseline di [MIGRATIONS.md](MIGRATIONS.md), lalu dari backend jalankan `npx prisma migrate deploy` dan `npx prisma generate`. Deploy schema/backend sebelum frontend baru. Client lama `POST /tracking/update/:id {lat,lng}` tetap diterima untuk sesi aktif miliknya, tetapi tidak dapat menggantikan posisi dari telemetri bertimestamp dan tidak menghasilkan kecepatan. Perubahan `updatedAt` bukan timestamp GPS. Pemilihan penerima warning tetap memakai jendela dua menit yang lama, tetapi sesi telemetri memakai waktu posisi GPS sehingga upload offline tidak menyegarkan warning palsu; interval/alur warning kereta tetap.

API baru/perluasan:

- `POST /tracking/update/:id {samples:[{id,capturedAt,lat,lng,accuracy,deviceSpeed}],reportedLoss?}` → `acknowledged:[id,...]`, ringkasan. Capture time epoch ms. Ringkasan/flag dari client diabaikan. Semua batch divalidasi sebelum menulis.
- `GET /tracking/active/:tugasId` menambah state terbatas dan flag uji untuk restore, hanya sesi PPJ sendiri.
- `GET /admin/live-positions` hanya membaca posisi dan ringkasan terbatas, tidak join sampel/rute/foto atau memindai seluruh riwayat. Waktu posisi dibedakan dari waktu sampel terbaru. Bila sampel baru buruk, posisi layak sebelumnya ditampilkan dengan label **“GPS lemah — posisi terakhir”** dan waktu posisi tersebut.
- `GET /tracking/:id/telemetry?cursor=<event id>` mengambil ringkasan dan maksimal 50 kejadian; `nextCursor` untuk halaman berikutnya. Diakses ketika detail tugas dibuka.
- `POST /tracking/stop/:id` juga menerima batch akhir opsional secara atomik. Frontend memakai flush terurut sebelum stop dan mengirim metadata kehilangan akhir.

Admin/KUPT dibatasi managerId; QC dibatasi stasiun wilayah; PPJ hanya sesi sendiri; guest tidak dapat mengakses telemetri. Metadata kehilangan dari client hanya informasi ketidaklengkapan, tidak dipercaya sebagai pembuktian aktivitas.

### Urutan, retry, dan transaksi

Update dan stop mengunci baris Tracking dengan `SELECT ... FOR UPDATE`, lalu memeriksa kepemilikan/status tugas di dalam transaksi yang sama. Sampel diinsert batch; state diproses incremental. Sesi stopped tidak menerima update tambahan, termasuk request yang sebelumnya menunggu lock.

Batch diurutkan berdasarkan capturedAt lalu ID. Identitas atau timestamp yang sudah ada diakui tanpa insert/hitung ulang; versi tersimpan pertama menang. Sampel dengan waktu lebih tua/sama dari watermark perhitungan disimpan `late` jika belum ada, tetapi tidak memundurkan posisi, state, atau menghitung ulang kejadian. Sampel sebelum awal sesi disimpan `before_start`. Sampel >24 jam disimpan tanpa dihitung. Sampel offline yang lebih baru dari watermark dapat berkontribusi pada ringkasan historis selama masih dalam batas 24 jam, tetapi hanya sampel baru yang fresh dan layak boleh memperbarui posisi live. Server tidak memakai waktu HTTP sebagai waktu pengambilan GPS. Retry setelah respons hilang aman karena indeks unique dan acknowledgment idempoten.

## Frontend, offline, dan lifecycle

Antrean `localStorage` terpisah dan terbatas, dikunci secara logis pada URL API, ID akun dan trackingId. Token sesi yang berubah menghentikan pengiriman oleh instance uploader lama. Riwayat lintas akun/server tidak direplay. Gunakan satu tab tracking per sesi; ini bukan platform sinkronisasi lintas tab/perangkat. Server tetap menduplikasi bila ada beberapa pengirim.

Sampel hanya dihapus dari antrean setelah diakui server. Snapshot bounded queue/state ditulis pada sampel pilihan sekitar lima detik dan saat ack, bukan setiap callback; rute peta lama dicadangkan terpisah setiap 30 detik/pagehide. Refresh memulihkan watermark/state dan antrean; timestamp sampel tidak diubah. Timer freshness satu detik tidak membuat sampel atau request upload kosong.

Antrean penuh mempertahankan sampel lama yang belum diakui, menolak sampel baru dan menaikkan counter kehilangan yang terlihat di PPJ serta monitoring/detail sesudah sinkronisasi. Storage quota/korupsi ditampilkan eksplisit; antrean memori tidak diklaim persisten sebelum storage pulih. Kerusakan snapshot dapat menyebabkan kehilangan yang jumlah tepatnya tidak diketahui. Jangan menganggap riwayat lengkap bila ada peringatan. Jangan menghapus storage browser selama ada antrean belum tersinkron.

Uploader hanya punya satu promise/request aktif, termasuk ketika stop bersamaan dengan upload lambat. Timer upload berikutnya dijadwalkan sesudah request selesai; kegagalan menaikkan backoff 20/40/60 detik. Offline mempertahankan antrean. UI tetap membedakan offline, belum tersinkron, GPS bermasalah, dan kedaluwarsa. Laporan/foto tetap online-first dan tidak ikut antrean telemetri.

Stop membekukan pengambilan telemetri, menunggu upload aktif dan menguras antrean berurutan. Batas mulai batch flush 45 detik, ditambah paling banyak sisa timeout request 15 detik; finalisasi stop HTTP mempunyai timeout 20 detik. Bila gagal, tugas tetap di halaman aktif, antrean tetap tersimpan dan pengambilan dilanjutkan; UI meminta koneksi diperiksa lalu stop dicoba kembali. Bila server sudah menyelesaikan stop tetapi respons hilang, refresh memulihkan status server dan mengarahkan ke hasil; jangan membuat sesi baru.

Polling hanya endpoint live setiap sekitar sepuluh detik sesudah request selesai, satu request aktif, backoff saat gagal, dibatalkan saat hidden/monitor ditutup/logout/unmount. Dashboard/daftar tugas/laporan dimuat ketika halaman dibuka, tombol Segarkan ditekan, atau aksi mengharuskan refresh; tidak diambil ulang berkala bersama posisi. Daftar monitoring mengecek freshness dengan waktu sekarang sehingga angka lama menghilang walaupun fetch gagal. Perubahan angka lokal berada di komponen kartu sendiri, tidak memicu render halaman/peta tambahan.

Upload dan polling masing-masing sepuluh detik berarti keterlambatan monitoring dapat mendekati **20 detik ditambah jaringan**, lebih lama ketika backoff, callback GPS jarang, atau halaman hidden. Bukan tracking real-time yang dijamin.

Screen Wake Lock memakai feature detection, request saat tracking aktif/visible, release saat hidden/unmount dan menangani release/kegagalan browser. Halaman harus tetap terbuka selama tugas. **Wake Lock tidak menjamin background tracking**; pindah aplikasi atau layar terkunci dapat menghentikan callback. Tidak ada perubahan native/PWA atau layanan berbayar.

## Volume, retensi, dan hasil pengujian

Target satu sampel/5 detik = 720/jam atau 5.760/shift delapan jam per PPJ. Contoh 100 PPJ dengan satu shift/hari: 576.000 baris/hari. Perkiraan anggaran 200–400 byte/baris termasuk overhead/index memberi sekitar 115–230 MB/hari; **ini perkiraan kapasitas**, bukan ukuran disk terukur. Ukur tabel/index/backup pada deployment sebenarnya. Disk juga menampung kejadian dan state kecil per sesi.

Rekomendasi awal: tinjau kebutuhan retensi sampel mentah 30–90 hari dengan pemilik data; ringkasan/kejadian dapat disimpan lebih lama sesuai kebutuhan peninjauan. Buat mekanisme arsip/penghapusan terjadwal terpisah hanya setelah kebijakan disepakati; fitur ini tidak menghapus data historis secara diam-diam.

Tes executable terdapat di `src/utils/telemetry.test.ts` backend, `test/telemetry.test.ts` frontend, serta `test/telemetry.test.ts` backend untuk MySQL nyata. Meliputi diam/jitter, jalan, start/stop pergerakan, cepat berkelanjutan, spike, device null/0/invalid, kualitas buruk, duplikat/mundur/gap/late, timer tanpa sampel, upload 20 detik tanpa overlap, retry/offline/refresh/kapasitas storage, stop race, freshness, polling visible, scope dan data lama. Suite workflow lama tetap menguji foto, radius, bypass, approval, PDF, laporan, import dan scheduler.

Uji beban lokal pada 19 Oktober 2026: 20 PPJ aktif, tiga putaran berjarak 10 detik, dua sampel per upload, total 60 request/120 sampel dan tiga polling live. Verifikasi lokal: `npm run verify` lolos (74 test backend, 12 test frontend, typecheck, lint dengan 19 warning lama tanpa error, dan build). Integrasi MySQL pada `ppj_audit_telemetry` lolos 19 pemeriksaan; `prisma migrate diff` tidak menemukan perbedaan schema. Hasil mesin dan run terakhir tersedia di `ppj-kai-backend/test/telemetry-load-result.json`. Fixture telemetri dihapus dari database audit setelah tes; hasil JSON tidak berisi data akun nyata. Hasil lokal ini **bukan jaminan kapasitas hosting produksi**, pengujian durasi shift penuh, atau uji perangkat nyata.

## Checklist perangkat nyata (belum dijalankan)

- [ ] Android Chrome dan iPhone Safari, HTTPS, izin lokasi tepat; periksa dukungan device speed/Wake Lock.
- [ ] Diam 3–5 menit, outdoor dan dekat bangunan: tidak ada indikasi palsu; noise kecil tidak menjadi jarak berjalan.
- [ ] Berjalan stabil di jalur aman, mulai/berhenti/balik arah: bandingkan dengan jarak/waktu acuan independen dan catat underestimation serta waktu pemanasan.
- [ ] Pergerakan lebih cepat diuji secara aman di area terkendali, bukan pada rel aktif; verifikasi label hanya sesudah durasi berkualitas, tanpa konsekuensi otomatis.
- [ ] Accuracy memburuk, GPS loncat, izin dicabut, callback jarang: angka menghilang/menjelaskan masalah, rangkaian terputus, posisi terakhir diberi waktu.
- [ ] Offline singkat lalu pulih: antrean meningkat, upload mengejar tanpa duplikasi; laporan/foto tetap membutuhkan koneksi.
- [ ] Refresh ketika online/offline dan setelah respons upload hilang: sesi/account/API tetap benar, watermark tidak dihitung dua kali.
- [ ] Simulasikan quota/storage diblokir dan antrean penuh: peringatan ketidaklengkapan tampil, jangan mengklaim rekaman penuh.
- [ ] Stop saat upload lambat/offline: batas tunggu jelas, kegagalan mempertahankan antrean; retry/refresh memulihkan status server.
- [ ] Pindah aplikasi, hidden, lock/unlock layar, low-power: catat apakah callback berhenti dan pastikan gap/freshness jujur; Wake Lock tidak dianggap jaminan.
- [ ] Monitoring admin/KUPT/QC: scope benar, update sekitar 10 detik saat visible; DevTools Network menunjukkan polling berhenti saat hidden/menu lain/logout.
- [ ] Rute panjang, foto, warning jadwal/PPJ, stop, approval, dan PDF di perangkat masih mengikuti alur lama.

Catat model perangkat, OS/browser, kondisi sinyal, accuracy, cadangan daya, timestamp/speed mentah, acuan lapangan, false positive/negative, dan rekomendasi perubahan konfigurasi sebelum pemakaian operasional.
