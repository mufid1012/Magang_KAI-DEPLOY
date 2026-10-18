# Tutorial Penggunaan Aplikasi

## KAI RailTrack PPJ — Monitoring Petugas Pemeriksa Jalur

**Untuk:** PT Kereta Api Indonesia, DAOP 6 Yogyakarta  
**Pengguna:** Admin/Super Admin, KUPT, QC, PPJ, dan Guest  
**Tanggal penyusunan:** 18 Oktober 2026  
**Dasar panduan:** kode aplikasi pada revisi `fcec0dd`.

Panduan ini menjelaskan cara memakai aplikasi melalui layar website. Nama menu dan tombol mengikuti implementasi yang tersedia pada saat panduan disusun. Admin dan Super Admin merupakan **role yang sama** di aplikasi; keduanya bukan dua tingkat akun terpisah.

Alamat website dan kontak bantuan mengikuti informasi yang diberikan pengelola KAI saat serah terima. Panduan ini tidak mencantumkan akun atau password contoh untuk digunakan dalam operasional.

> **Perhatikan sebelum digunakan:** terdapat batasan alur approval untuk petugas kelolaan KUPT, perbedaan label foto akhir dengan syarat tombol selesai, serta keterbatasan penggunaan offline. Penjelasannya tersedia pada bagian terkait dan dirangkum di [Catatan versi aplikasi](#12-catatan-versi-aplikasi).

## Daftar isi

1. [Mengenal aplikasi dan hak akses](#1-mengenal-aplikasi-dan-hak-akses)
2. [Persiapan, masuk, dan keluar](#2-persiapan-masuk-dan-keluar)
3. [Alur kerja dan arti status](#3-alur-kerja-dan-arti-status)
4. [Tutorial Admin/Super Admin](#4-tutorial-adminsuper-admin)
5. [Tutorial KUPT](#5-tutorial-kupt)
6. [Tutorial QC](#6-tutorial-qc)
7. [Tutorial PPJ](#7-tutorial-ppj)
8. [Tutorial Guest](#8-tutorial-guest)
9. [Membaca dan menyimpan laporan PDF](#9-membaca-dan-menyimpan-laporan-pdf)
10. [Penanganan kendala umum](#10-penanganan-kendala-umum)
11. [Daftar periksa operasional](#11-daftar-periksa-operasional)
12. [Catatan versi aplikasi](#12-catatan-versi-aplikasi)
13. [Informasi bantuan dan serah terima](#13-informasi-bantuan-dan-serah-terima)

## 1. Mengenal aplikasi dan hak akses

Aplikasi digunakan untuk menugaskan pemeriksaan jalur, merekam perjalanan PPJ menggunakan GPS, mengirim laporan kendala, memantau petugas, dan mendokumentasikan hasil inspeksi.

### 1.1 Pembagian peran

| Role | Halaman setelah masuk | Kegunaan utama |
| --- | --- | --- |
| Admin/Super Admin | Command Center PPJ | Mengelola akun, petugas kelolaan, penugasan, titik peta, kategori temuan, foto login, serta approval inspeksi dalam kelolaannya. |
| KUPT | Command Center PPJ dengan menu terbatas | Mengelola petugas dan penugasan, memantau inspeksi, membaca laporan, serta mengatur kategori dan sirine. |
| QC | Quality Control PPJ | Memantau tugas, posisi petugas, dan insiden berdasarkan wilayah yang diberikan. |
| PPJ | Lacak | Memilih tugas, menjalankan inspeksi, mengirim kendala/peringatan, dan melihat hasil inspeksi sendiri. |
| Guest | Peta Mode Publik | Melihat peta jalur dan stasiun DAOP 6 tanpa mengubah data. |

### 1.2 Ringkasan fitur melalui layar aplikasi

| Fitur | Admin/Super Admin | KUPT | QC | PPJ | Guest |
| --- | --- | --- | --- | --- | --- |
| Membuat dan mengelola akun pengguna | Ya | Tidak | Tidak | Tidak | Tidak |
| Menentukan wilayah QC/KUPT | Ya | Tidak | Tidak | Tidak | Tidak |
| Menambah/melepas petugas kelolaan | Ya | Ya | Tidak | Tidak | Tidak |
| Membuat tugas manual dan import Excel | Ya | Ya, sesuai wilayah | Tidak | Tidak | Tidak |
| Memantau posisi petugas | Kelolaan sendiri | Kelolaan sendiri | Sesuai wilayah | Posisi diri saat inspeksi | Tidak |
| Melakukan tracking dan melapor | Tidak | Tidak | Tidak | Tugas sendiri | Tidak |
| Approval hasil inspeksi | Kelolaan sendiri | Tidak | Tidak | Tidak | Tidak |
| Unduh PDF dari tombol di halaman | Ya | Ya | Belum tersedia | Setelah approval | Tidak |
| Kelola titik pada menu Map | Ya | Tidak | Tidak | Tidak | Tidak |
| Kelola kategori temuan | Ya | Ya | Tidak | Tidak | Tidak |
| Pengaturan sirine darurat | Ya | Ya | Belum tersedia | Peringatan saat tracking | Tidak |
| Kelola foto halaman login | Ya | Tidak | Tidak | Tidak | Tidak |
| Lihat peta publik tanpa login | Ya | Ya | Ya | Ya | Ya |

### 1.3 Mengapa data setiap pengguna berbeda?

- **Admin dan KUPT:** daftar tugas, posisi, dan laporan mengikuti petugas yang sedang berada dalam kelolaannya. Super Admin tidak otomatis melihat seluruh tugas milik semua KUPT pada dashboard Tugas.
- **QC:** cakupan data mengikuti wilayah akun. Tugas dapat terlihat jika titik awal atau titik akhirnya masuk wilayah QC.
- **PPJ:** hanya melihat penugasan untuk akunnya sendiri.
- **Guest:** hanya mendapat tampilan peta jalur dan stasiun publik.

Satu petugas memiliki satu pengelola pada satu waktu. Perpindahan pengelola memengaruhi siapa yang dapat melihat tugas dan riwayat petugas tersebut. Penetapan wilayah KUPT juga membatasi pilihan stasiun saat membuat tugas.

## 2. Persiapan, masuk, dan keluar

### 2.1 Persiapan perangkat

1. Buka alamat resmi aplikasi yang diberikan pengelola KAI melalui browser.
2. Pastikan koneksi internet tersedia. Komputer/laptop memudahkan pengelolaan akun dan Excel; ponsel dengan GPS dan kamera digunakan untuk inspeksi lapangan.
3. Untuk PPJ, aktifkan lokasi perangkat dan izinkan akses **Lokasi/GPS** serta **Kamera** ketika diminta browser.
4. Gunakan alamat HTTPS yang disediakan pengelola agar akses GPS dan kamera dapat bekerja.
5. Sesuaikan waktu perangkat ke WIB/Asia Jakarta dan aktifkan pengaturan tanggal/jam otomatis.
6. Pastikan volume perangkat terdengar apabila menggunakan alarm atau peringatan kereta.

Selama inspeksi, pertahankan halaman tracking tetap terbuka. Penguncian layar, perpindahan aplikasi, atau pembatasan baterai dapat menghambat pembaruan GPS dan suara.

### 2.2 Masuk dengan akun

1. Pada halaman **Akses Portal**, masukkan **NIPP (Employee ID)**.
2. Masukkan **Password**. Gunakan ikon mata bila perlu memeriksa pengetikan.
3. Tekan **Masuk** dan tunggu proses **Memverifikasi...**.
4. Aplikasi mengarahkan Anda ke halaman sesuai role.
5. Periksa nama dan role yang tampil sebelum bekerja.

**Hasil yang diharapkan:** halaman role terbuka tanpa pesan kesalahan. Pengguna tidak perlu memilih role pada formulir login.

Jika belum memiliki akun, hubungi Super Admin. Tidak tersedia pendaftaran mandiri. Tautan **Lupa Password?** pada versi ini belum menjalankan pemulihan password; minta bantuan Super Admin. Untuk akun Super Admin sendiri, hubungi penanggung jawab teknis karena pengelolaan akun admin tidak disediakan melalui menu Akun.

### 2.3 Masuk sebagai Guest

Pada halaman login, pilih **Masuk Sebagai Guest**. Peta publik terbuka tanpa NIPP dan password. Petunjuk lengkap ada di [Tutorial Guest](#8-tutorial-guest).

### 2.4 Keluar dan sesi berakhir

- Pada Admin, KUPT, dan QC, gunakan ikon **logout/keluar** di bagian atas.
- Pada PPJ, ikon **Logout** ada di halaman **Lacak**. Selesaikan dan pastikan hasil inspeksi terkirim sebelum keluar.
- Jika aplikasi kembali ke halaman login karena sesi berakhir, masuk kembali menggunakan akun yang sama.
- Jika role baru saja diubah oleh Super Admin, keluar lalu masuk kembali agar tampilan mengikuti role terbaru.

Keluar atau menutup tab bukan tindakan untuk menyelesaikan inspeksi. PPJ harus menggunakan **Selesai Inspeksi → Konfirmasi Selesai**.

## 3. Alur kerja dan arti status

### 3.1 Urutan pekerjaan

1. **Super Admin** menyiapkan akun, wilayah, serta pembagian petugas.
2. **Admin/KUPT** membuat penugasan manual atau melalui Excel.
3. **PPJ** membuka tugas, memastikan GPS dan lokasi awal, lalu memulai tracking.
4. **PPJ** menjalankan pemeriksaan dan mengirim kendala jika ada.
5. **Admin/KUPT/QC** memantau sesuai cakupan akses.
6. **PPJ** tiba di titik akhir, melengkapi foto akhir, dan mengonfirmasi selesai.
7. Tugas menjadi **Butuh Approval**. **Admin yang berwenang atas petugas tersebut** meninjau hasil dan menetapkan **Aman** atau **Tidak Aman**.
8. Tugas menjadi **Selesai**, lalu PPJ dapat mengunduh PDF.

> Untuk petugas yang masih dikelola KUPT, langkah approval belum memiliki alur langsung yang lengkap pada versi ini. Baca [batasan approval KUPT](#54-tindak-lanjut-hasil-inspeksi-dan-batasan-approval).

### 3.2 Arti status

| Status di layar | Arti | Tindakan pengguna |
| --- | --- | --- |
| Pending / Menunggu | Tugas sudah dibuat, tracking belum dimulai. | PPJ memeriksa tanggal, jadwal, dan lokasi awal. |
| Belum Waktunya | Waktu untuk mulai tracking belum dibuka. | Tunggu waktu yang ditetapkan. |
| Berlangsung / Sedang Berlangsung | Sesi tracking telah dimulai. | PPJ melanjutkan inspeksi; pengawas memantau. |
| Butuh Approval / Menunggu Approval Admin | PPJ sudah mengirim penyelesaian, tetapi hasil belum disetujui. | Admin meninjau; PPJ menunggu tanpa memulai ulang tugas. |
| Selesai / Tracking Approved | Hasil tracking sudah disetujui. | Baca status keselamatan dan simpan PDF. |
| Tidak Selesai / Terlewat | Batas waktu mulai tugas telah terlampaui atau tugas telah ditandai terlewat. | Hubungi pengelola untuk tindak lanjut penugasan. |
| Dibatalkan | Status pembatalan jika terdapat pada data. | Jangan lanjutkan tugas tersebut; hubungi pengelola. |

**Selesai tidak selalu berarti Aman.** Hasil yang disetujui dapat berstatus **Tidak Aman**. Sebaliknya, tulisan **Aman** sebelum approval belum merupakan keputusan akhir Admin.

Angka **Tugas Aktif** pada dashboard Admin/KUPT mencakup tugas Pending, Berlangsung, dan Butuh Approval. Untuk melihat yang benar-benar sedang dikerjakan, gunakan filter **Berlangsung** atau menu **Live**.

## 4. Tutorial Admin/Super Admin

### 4.1 Mengenali menu

| Menu | Isi |
| --- | --- |
| Tugas | Statistik, tab Petugas/Penugasan/Insiden, dan daftar penugasan. |
| Live | Peta rute inspeksi aktif, posisi petugas, dan marker laporan. |
| Map | Stasiun dan titik lokasi tambahan untuk penugasan. |
| Akun | Pembuatan, perubahan, aktivasi, penonaktifan, dan penghapusan akun. |
| Setting | Foto login, suara sirine, kategori temuan, dan informasi sistem. |

Pada komputer menu berada di sisi halaman; pada layar kecil navigasi dapat berada di bawah. Gunakan nama menu yang sama.

### 4.2 Membuat akun pengguna

1. Buka **Akun → Buat Akun**.
2. Isi **NIPP**, **Nama Lengkap**, **Password**, dan **Role**.
3. Pilih role **PPJ**, **QC**, **KUPT**, atau **Guest**.
4. Untuk **QC**, pilih wilayah pemantauan yang menjadi tanggung jawabnya.
5. Untuk **KUPT**, pilih **minimal dua wilayah** dan centang **Petugas yang Dikelola**. Gunakan pencarian nama/NIPP untuk menemukan petugas.
6. Tekan **Buat Akun**.
7. Pastikan akun muncul dengan status **Aktif**, role, dan wilayah yang benar.
8. Sampaikan akses akun kepada pemiliknya melalui prosedur internal KAI.

Ketentuan pengisian:

- NIPP harus unik. Gunakan NIPP paling banyak 20 karakter agar sesuai batas login.
- Password menerima 6–128 karakter; gunakan password sesuai kebijakan internal KAI.
- Akun Super Admin tidak dapat dibuat melalui formulir ini.
- Buat akun PPJ terlebih dahulu agar dapat dipilih sebagai petugas kelolaan KUPT.
- Membuat akun PPJ tidak otomatis memasukkannya ke daftar kelolaan Admin.

**Perhatikan pembagian petugas:** saat memilih petugas untuk KUPT, layar menampilkan pengelolanya saat ini. Petugas yang dicentang dapat berpindah dari pengelola lain ke KUPT tersebut setelah disimpan.

### 4.3 Mengubah akun, wilayah, atau password

1. Buka **Akun**, lalu cari NIPP atau nama pengguna.
2. Tekan ikon pensil **Edit akun**.
3. Ubah nama, role, wilayah, atau petugas kelolaan sesuai kebutuhan.
4. Untuk mengganti password, isi **Password Baru (opsional)**. Kosongkan jika tidak ingin mengubahnya.
5. Tekan **Simpan Perubahan** dan periksa kembali hasilnya.

NIPP tidak dapat diubah pada formulir edit. Penggantian role mengosongkan pilihan wilayah/petugas pada formulir, sehingga periksa kembali semua pilihan sebelum menyimpan. Akun Admin tidak dapat diedit melalui menu ini.

### 4.4 Menonaktifkan atau menghapus akun

**Menonaktifkan sementara:** cari akun, tekan **Nonaktifkan akun**, lalu konfirmasi. Status berubah menjadi **Nonaktif** dan akun tidak dapat digunakan. Gunakan **Aktifkan akun** untuk mengaktifkannya kembali. Data akun tetap tersimpan.

**Menghapus permanen:** tekan ikon **Hapus permanen**, baca nama/NIPP serta dampak pada dialog, kemudian konfirmasi hanya bila penghapusan memang diperlukan.

> Penghapusan permanen ikut menghapus data milik akun, termasuk penugasan, riwayat inspeksi, laporan, foto, dan warning terkait. Petugas yang dikelola akun tersebut dilepas dari kelolaannya, bukan ikut dihapus. Aplikasi menolak penghapusan akun Admin, akun sendiri, dan akun yang masih menjalankan inspeksi. Penghapusan tidak dapat dibatalkan melalui aplikasi.

### 4.5 Menambah dan melepas petugas kelolaan

**Menambah petugas:**

1. Buka **Tugas → Petugas**.
2. Tekan **Tambah Petugas Kelolaan**.
3. Cari nama atau NIPP.
4. Pilih satu atau beberapa petugas.
5. Tekan **Tambahkan (jumlah)**.
6. Pastikan petugas masuk daftar kelolaan.

Daftar penambahan menampilkan PPJ yang belum memiliki pengelola. Jika tidak ditemukan, periksa apakah akun sudah dibuat atau masih dikelola Admin/KUPT lain.

**Melihat riwayat:** klik kartu nama petugas untuk membuka **Riwayat Pekerjaan Tracking**. Periksa jalur, status, tanggal, durasi, dan laporan kendalanya.

**Melepas petugas:** tekan ikon hapus pada kartu petugas dan konfirmasi. Tindakan ini hanya melepas hubungan pengelolaan. Akun dan riwayat tetap ada, tetapi tidak lagi muncul dalam cakupan kelolaan Anda.

### 4.6 Membuat tugas secara manual

1. Buka **Tugas**, kemudian tab **Penugasan** pada panel aktivitas.
2. Tekan **Tugaskan Pemeriksa**.
3. Pilih **Petugas Pemeriksa** dari daftar kelolaan.
4. Pilih titik awal dan titik akhir pengecekan. Admin dapat memilih stasiun atau titik tambahan yang telah disimpan melalui menu **Map**.
5. Periksa koordinat yang terisi otomatis dan **Nama Jalur Inspeksi**.
6. Isi **Tanggal Inspeksi**, **Jam Mulai**, dan **Jam Selesai** menggunakan WIB.
7. Tekan **Simpan & Tugaskan**.
8. Pastikan pesan berhasil muncul dan tugas tercatat sebagai **Pending**.

Gunakan titik awal dan akhir yang berbeda. Pertahankan nama stasiun dalam nama jalur agar filter wilayah QC mudah mengenalinya. Estimasi jarak pada formulir adalah jarak antar-koordinat, sehingga dapat berbeda dari jarak berjalan yang direkam GPS.

**Contoh:** tugaskan PPJ yang sesuai pada jalur `Sta. Yogyakarta → Sta. Lempuyangan`, tanggal operasional yang disepakati, mulai `08:00`, selesai `09:00`. Contoh ini bukan penugasan yang sudah tersimpan.

Jam Mulai menentukan batas waktu untuk **memulai** tracking: satu jam sebelum sampai satu jam sesudah jadwal. Jam Selesai merupakan jadwal tugas; jangan menganggap aplikasi otomatis menghentikan tracking pada jam tersebut.

### 4.7 Membuat banyak tugas melalui Excel

1. Buka **Tugas → Penugasan → Download Template**.
2. Buka file `template_penugasan_ppj.xlsx`.
3. Pada sheet pertama, **Template Penugasan**, ganti atau hapus baris contoh. Jangan mengimpor tanggal dan petugas contoh tanpa diperiksa.
4. Isi satu baris untuk satu tugas. Pertahankan urutan kolom dan header.
5. Gunakan sheet **Daftar Titik Pengecekan** sebagai referensi nama titik dan **Daftar Petugas** sebagai referensi NIPP.
6. Simpan sebagai **.xlsx**, lalu kembali ke **Import Excel** dan pilih file.
7. Tunggu jendela **HASIL IMPORT EXCEL**. Periksa **Total Baris**, **Berhasil**, **Gagal**, dan pesan setiap baris.
8. Tutup hasil import dan cocokkan tugas yang terbentuk dengan rencana penugasan.

| Urutan | Kolom template | Cara mengisi |
| --- | --- | --- |
| A | NIPP Petugas | NIPP akun PPJ aktif. Ini yang menentukan penerima tugas. |
| B | Nama Petugas | Nama untuk membantu pengecekan; pencocokan penerima tetap berdasarkan NIPP. |
| C | Titik Awal | Salin nama dari Daftar Titik Pengecekan. |
| D | Titik Akhir | Pilih titik berbeda dari Titik Awal. |
| E | Tanggal (YYYY-MM-DD) | Contoh `2026-10-20`; sesuaikan jadwal sebenarnya. |
| F | Jam Mulai (HH:mm) | Contoh `08:00`, atau sel waktu Excel yang setara. |
| G | Jam Selesai (HH:mm) | Contoh `09:00`, atau sel waktu Excel yang setara. |

Ketentuan import:

- File maksimal **5 MB**. Gunakan template `.xlsx`, bukan CSV atau `.xls`.
- Sistem membaca sheet pertama; jangan memindahkan sheet referensi menjadi sheet pertama.
- Batas pembacaan adalah 5.000 baris termasuk header dan 50 kolom. Template hanya membutuhkan tujuh kolom di atas.
- NIPP harus milik PPJ aktif yang dikelola Anda atau belum memiliki pengelola.
- Petugas yang belum dikelola otomatis masuk kelolaan pengimpor setelah barisnya berhasil disimpan.
- Petugas yang dikelola pihak lain tidak dipindahkan otomatis melalui import.
- Sistem dapat mengenali variasi penulisan/typo tertentu, tetapi tetap periksa nama hasil pencocokan.
- KUPT harus menggunakan titik awal dan akhir dalam wilayahnya.

> **Import dapat berhasil sebagian.** Baris yang berhasil langsung menjadi tugas. Jika ada kegagalan, perbaiki dan unggah **hanya baris gagal** dengan header yang sama. Mengunggah ulang seluruh file dapat menggandakan tugas yang sudah berhasil.

### 4.8 Mencari, memeriksa, dan menghapus tugas

Pada **Daftar Penugasan PPJ**, Anda dapat:

1. Mencari berdasarkan nama jalur, nama petugas, atau NIPP.
2. Memilih **Semua**, **Pending**, **Berlangsung**, **Butuh Approval**, atau **Selesai**.
3. Mengisi rentang tanggal **Dari** dan **Sampai**; kedua tanggal batas ikut dihitung.
4. Menggunakan **Hapus tanggal** atau **Reset filter** bila hasil yang dicari tidak muncul.
5. Mengklik kartu tugas untuk membuka **Detail Inspeksi**.

Detail memuat identitas petugas, rute, tanggal, waktu mulai/selesai, durasi, foto verifikasi bila ada, status approval, status keselamatan, serta laporan kendala.

Untuk menghapus tugas, gunakan ikon hapus pada daftar di tab **Penugasan**, lalu konfirmasi. **Penghapusan tugas ikut menghapus tracking dan laporan terkait.** Tidak tersedia tombol edit tugas pada halaman ini. Jika ada kesalahan jadwal, koordinasikan koreksi dengan pengelola sebelum menghapus atau membuat pengganti, terutama bila inspeksi telah berjalan.

### 4.9 Memantau Live dan membaca insiden

1. Buka **Live** untuk melihat rute tugas yang sedang berlangsung dan posisi petugas kelolaan.
2. Geser peta dan gunakan kontrol pembesaran untuk memeriksa area tertentu.
3. Arahkan penunjuk atau sentuh marker petugas untuk melihat informasi yang tersedia, termasuk nama, jalur, dan waktu pembaruan posisi.
4. Klik marker peringatan untuk membuka **Detail Insiden**.
5. Alternatifnya, buka **Tugas → Insiden**, lalu pilih laporan.
6. Baca kategori, waktu, foto bila ada, deskripsi, pelapor, jalur, dan koordinat.
7. Tindak lanjuti sesuai prosedur internal KAI.

Dashboard memperbarui data secara berkala, sekitar 15 detik saat halaman aktif dan tersambung. Data posisi adalah pembaruan terakhir yang diterima, bukan jaminan posisi saat ini jika jaringan/GPS petugas terhenti. Rute aktif hilang dari menu Live setelah sesi selesai dan data diperbarui; laporan insiden tetap dapat terlihat.

### 4.10 Menyetujui hasil inspeksi

1. Buka **Tugas → Butuh Approval** pada filter daftar tugas.
2. Klik kartu yang akan diperiksa.
3. Tinjau identitas petugas, waktu, foto, dan semua laporan kendala. Bila diperlukan, unduh draft melalui **Download Laporan PDF**.
4. Pilih **Approve Aman** atau **Approve Tidak Aman** berdasarkan hasil pemeriksaan.
5. Baca dialog dan konfirmasi pilihan.
6. Pastikan status tugas berubah menjadi **Selesai** dan status tracking menjadi **Approved**.
7. PPJ kemudian dapat mengunduh PDF melalui riwayat atau halaman detail selesai.

Tombol approval hanya tersedia bagi Admin untuk tracking yang sudah dihentikan dan belum disetujui, serta petugasnya berada dalam kelolaan Admin tersebut. **Approve Tidak Aman** tetap menyetujui pencatatan hasil, dengan keputusan keselamatan **Tidak Aman**. Ini bukan tombol penolakan atau permintaan revisi. Tidak tersedia pembatalan approval melalui layar ini.

### 4.11 Menambah titik pengecekan pada Map

Menu **Map** berbeda dari **Live**: Map digunakan untuk menyiapkan lokasi, sedangkan Live untuk pemantauan.

**Cara A — Klik peta:**

1. Buka **Map** dan cari area yang dimaksud.
2. Klik lokasi di peta untuk membuka **Tambah Titik Lokasi**.
3. Geser marker rancangan bila posisi perlu diperbaiki.
4. Isi **Nama Lokasi** dan **Catatan (Opsional)**.
5. Periksa koordinat, lalu tekan **Simpan Titik**.

**Cara B — Input koordinat:**

1. Tekan **Input Koordinat**.
2. Masukkan **Latitude** dan **Longitude** dalam angka desimal, misalnya `-7.788870` dan `110.363213`.
3. Tekan **Terapkan Koordinat** dan periksa letak marker.
4. Isi nama lokasi dan catatan, kemudian **Simpan Titik**.

**Cara C — Pencarian lokasi:**

1. Ketik minimal tiga karakter pada kolom pencarian tempat/alamat.
2. Jalankan pencarian dengan tombol cari atau Enter.
3. Pilih hasil yang sesuai, periksa posisi, dan sesuaikan nama/catatan.
4. Tekan **Simpan Titik**. Memilih hasil pencarian saja belum menyimpannya.

Di tabel bawah peta, cari titik berdasarkan nama, jenis, alamat, atau koordinat. Gunakan **Lihat** untuk memusatkan peta, **Lihat Semua** untuk melihat seluruh titik, dan **Muat Ulang** untuk mengambil data kembali.

Titik tambahan milik Admin tersedia pada pilihan awal/akhir penugasan dan template Excel Admin tersebut. Stasiun bawaan dapat dilihat, tetapi tidak dihapus dari menu ini. Untuk titik tambahan, gunakan **Hapus/Hapus Titik** dan konfirmasi bila memang tidak diperlukan. Form edit titik yang sudah tersimpan belum tersedia.

### 4.12 Mengatur suara sirine

1. Buka **Setting → Pengaturan Sirine Darurat**.
2. Pilih **Mati**, **Sirine**, **Beep**, atau **Lonceng**.
3. Tunggu pesan **Pengaturan sirine berhasil disimpan**. Pilihan bersuara juga diperdengarkan sebagai pratinjau.
4. Pastikan suara browser/perangkat tidak dibisukan.

Laporan baru berkategori **Darurat (Merah)** dapat memicu alarm berulang dan pembacaan suara. Kategori **Ringan (Biru)** tetap tercatat tanpa sirine. Laporan yang sudah ada saat halaman pertama dibuka tidak otomatis diputar ulang sebagai alarm baru.

Saat alarm muncul, tekan **Matikan Alarm** pada panel atau **Stop Alarm** di header, lalu periksa **Insiden**. Mematikan suara tidak menghapus laporan dan tidak menandai kendala telah diselesaikan.

### 4.13 Mengelola kategori temuan

1. Buka **Setting → Kelola Kategori Temuan → Tambah**.
2. Isi **Key (Unik, tanpa spasi)**, misalnya `patah_rel`. Gunakan huruf kecil, angka, dan garis bawah; batasi hingga 20 karakter agar dapat digunakan saat pengiriman laporan.
3. Isi **Label (Tampil di UI)**, misalnya `Patah Rel`.
4. Pilih **Darurat (Merah)** atau **Ringan (Biru)**.
5. Pilih ikon, lalu tekan **Tambah Kategori**.
6. Untuk mengubah label, tingkat, atau ikon, tekan **Edit kategori → Simpan Perubahan**. Key tidak diubah dari formulir edit.
7. Untuk mengatur urutan, seret kartu kategori ke posisi yang dikehendaki; tunggu penyimpanan selesai.

Perubahan kategori berlaku pada daftar kategori bersama yang digunakan PPJ, bukan hanya pada petugas kelolaan pembuatnya. Koordinasikan penamaan dan tingkat darurat dengan pengelola lain, termasuk KUPT.

**Hapus kategori bersifat permanen pada versi ini.** Laporan lama tetap ada, tetapi dapat menampilkan key lama sebagai pengganti label setelah kategori dihapus. Jangan menghapus kategori yang masih dibutuhkan untuk membaca arsip.

### 4.14 Mengganti foto halaman login

1. Buka **Setting → Foto Halaman Login → Tambah Foto**.
2. Isi **Judul foto** dan pilih file **PNG/JPG**.
3. Gunakan ukuran maksimal **5 MB** dan **40 megapiksel**.
4. Isi **Urutan tampil**. Angka lebih kecil tampil lebih dahulu.
5. Centang **Tampilkan di halaman login** bila foto hendak ditampilkan.
6. Periksa pratinjau, lalu tekan **Simpan Foto**.

Gunakan **Edit** untuk mengubah judul, urutan, status tampil, atau mengganti file. Hilangkan centang tampil untuk menyembunyikannya dari slideshow tanpa menghapus data. Gunakan **Hapus** untuk menghapus foto.

Foto muncul pada panel kiri halaman login desktop, berganti sekitar setiap enam detik. Pada layar ponsel panel ini disembunyikan. Bila tidak ada foto aktif, aplikasi memakai gambar kereta bawaan. Perangkat dengan preferensi pengurangan gerakan dapat menonaktifkan pergantian otomatis.

## 5. Tutorial KUPT

### 5.1 Persiapan akun dan cakupan tugas

Super Admin menyiapkan akun KUPT, minimal dua wilayah, serta petugas kelolaannya. Setelah masuk, KUPT melihat menu **Tugas**, **Live**, dan **Setting**. Menu **Akun**, **Map**, dan pengelolaan foto login tidak tersedia untuk KUPT.

Periksa daftar **Petugas** terlebih dahulu. Jika daftar atau pilihan stasiun belum sesuai, minta Super Admin memeriksa wilayah dan pembagian petugas.

### 5.2 Menjadwalkan pemeriksaan

1. Buka **Tugas → Petugas** untuk memeriksa petugas yang tersedia dalam kelolaan.
2. Bila diperlukan, gunakan **Tambah Petugas Kelolaan** untuk mengambil petugas yang belum memiliki pengelola.
3. Buka **Penugasan → Tugaskan Pemeriksa**.
4. Pilih petugas, titik awal dan akhir dari stasiun dalam wilayah KUPT, tanggal, serta jam kerja.
5. Tekan **Simpan & Tugaskan** dan pastikan status **Pending** muncul.

Untuk banyak tugas, ikuti [petunjuk import Excel](#47-membuat-banyak-tugas-melalui-excel). Kedua titik harus sesuai wilayah KUPT, walaupun sheet referensi dapat memuat stasiun lain. Titik tambahan dari menu Map Admin tidak tersedia sebagai pilihan penugasan KUPT.

### 5.3 Memantau petugas dan laporan

1. Buka **Live** untuk memantau posisi petugas kelolaan.
2. Buka **Tugas → Insiden** atau klik marker insiden pada peta.
3. Baca laporan dan koordinasikan tindak lanjut sesuai prosedur internal.
4. Gunakan pencarian, filter status, dan tanggal pada daftar penugasan untuk meninjau pekerjaan.
5. Klik kartu tugas untuk membuka detail dan **Download Laporan PDF** bila diperlukan.

KUPT juga dapat mengatur suara melalui **Setting → Pengaturan Sirine Darurat** dan mengelola kategori melalui **Setting → Kelola Kategori Temuan**. Ikuti langkah pada bagian Admin; perubahan kategori berdampak bersama pada aplikasi.

### 5.4 Tindak lanjut hasil inspeksi dan batasan approval

Setelah PPJ menyelesaikan perjalanan, hasil masuk **Butuh Approval**. KUPT dapat membaca detail dan mengunduh draft, tetapi **tidak memiliki tombol atau kewenangan approval**.

Pada versi ini, Admin juga hanya dapat menyetujui hasil petugas yang berada dalam kelolaannya sendiri. Karena itu, hasil petugas yang masih dikelola KUPT **tidak otomatis muncul untuk disetujui Admin**.

Jika menemui kondisi ini:

1. Catat ID tugas, nama/NIPP petugas, jalur, dan tanggal.
2. Sampaikan kepada Super Admin serta penanggung jawab teknis bahwa hasil masih berada pada kelolaan KUPT dan menunggu approval.
3. Jangan mengulang tracking atau menghapus tugas untuk mencoba membuka PDF PPJ.
4. Gunakan draft hanya untuk peninjauan, dengan menyebutkan bahwa hasil belum disetujui.

Alur kewenangan approval untuk kelolaan KUPT perlu dipastikan oleh pengelola sebelum operasional penuh. Perpindahan petugas bukan sekadar tindakan approval karena ikut mengubah akses terhadap seluruh tugas petugas tersebut.

## 6. Tutorial QC

### 6.1 Membuka pemantauan wilayah

1. Masuk menggunakan akun QC.
2. Pastikan halaman **Quality Control PPJ** terbuka.
3. Pada **Filter Jalur**, pilih **Semua Jalur** untuk seluruh cakupan akun atau pilih salah satu wilayah JR.
4. Perhatikan peta, **Daftar Tugas**, dan ringkasan **Aktif**, **Pending**, **Selesai**, serta **Insiden** yang mengikuti filter.
5. Pilih kembali **Semua Jalur** untuk mengembalikan cakupan tampilan.

Wilayah berasal dari penetapan Super Admin. QC tidak dapat menambah wilayahnya sendiri. Statistik ringkas di bawah filter mengikuti pilihan wilayah; kartu statistik global merangkum cakupan akun dan tidak selalu sama dengan pilihan filter.

### 6.2 Membaca peta dan daftar tugas

- Baca nama jalur, petugas, tanggal, dan status pada **Daftar Tugas**.
- Gunakan pembesaran dan geser peta untuk melihat area pemeriksaan.
- Marker petugas menunjukkan posisi yang terakhir diterima beserta waktu pembaruannya.
- Garis putus-putus digunakan untuk tugas Pending; warna rute juga dapat mengikuti identitas petugas. Gunakan label status pada daftar, bukan warna saja.
- Peta QC dapat memuat tugas dari beberapa status, sedangkan marker posisi live berasal dari sesi yang masih aktif.
- Peta dibatasi pada wilayah akun/pilihan filter; tidak bisa digeser bebas ke seluruh area di luar cakupan tersebut.

Halaman mencoba memperbarui data setiap sekitar 15 detik saat terbuka dan tersambung. Indikator **Live Sync** tidak menggantikan pemeriksaan waktu pembaruan posisi.

### 6.3 Memeriksa insiden

1. Temukan marker peringatan pada peta.
2. Klik marker untuk membuka **DETAIL INSIDEN**.
3. Baca kategori, waktu pelaporan, deskripsi, foto bila tersedia, nama pelapor, jalur, dan koordinat GPS.
4. Koordinasikan penanganan dengan pihak terkait sesuai prosedur internal KAI.
5. Tutup detail menggunakan ikon **X**.

Halaman QC bersifat pemantauan: tidak menyediakan pembuatan tugas, penghapusan data, approval, pengaturan sirine, atau tombol unduh PDF. Jika membutuhkan berkas laporan, minta Admin/KUPT pengelola petugas menyediakan PDF dan periksa status approval-nya. Jangan mengandalkan alarm suara pada halaman QC versi ini; pantau informasi visual.

## 7. Tutorial PPJ

### 7.1 Memilih tugas

1. Masuk menggunakan akun PPJ. Halaman **Lacak** memiliki tab **Tugas** dan **Riwayat**.
2. Pada **Tugas**, periksa jalur, titik awal/akhir, tanggal, dan jam.
3. Tekan **Buka** pada tugas yang dapat dikerjakan.
4. Jika sudah ada inspeksi berlangsung, aplikasi dapat langsung mengarahkan Anda kembali ke sesi tersebut.

Jika muncul **Tugas Belum Tersedia**, hubungi Admin/KUPT. PPJ tidak membuat tugas sendiri. Jika baru saja ditugaskan tetapi belum terlihat, buka ulang halaman daftar tugas.

### 7.2 Memahami waktu mulai

Untuk tugas dengan Jam Mulai, tracking dibuka dari **satu jam sebelum hingga satu jam sesudah** jadwal.

| Contoh jadwal | Waktu yang dapat digunakan untuk mulai |
| --- | --- |
| Mulai 08:00 WIB | 07:00–09:00 WIB pada tanggal yang sesuai |
| Mulai 14:30 WIB | 13:30–15:30 WIB pada tanggal yang sesuai |

Sebelum waktunya, kartu/tombol menunjukkan **Belum Waktunya** atau **Dibuka Pukul ...**. Setelah terlewat, dapat muncul **Tidak Selesai**, **Terlewat**, atau **Waktu Tracking Berakhir**. Hubungi pengelola bila perlu penugasan lanjutan.

Batas ini mengatur saat mulai, bukan batas durasi perjalanan setelah tracking aktif. Jika tugas tidak memiliki Jam Mulai, pembatasan berdasarkan jam tersebut tidak diterapkan; tetap ikuti arahan pengelola.

### 7.3 Memulai inspeksi

1. Buka tugas hingga panel **Inspection Setup** tampil.
2. Tunggu **GPS Location Locked**. Perhatikan angka **Accuracy**, yaitu perkiraan ketelitian GPS dalam meter.
3. Pastikan Anda berada dalam radius **500 meter dari titik awal tugas**. Baca **Jarak ke Titik Awal** pada layar.
4. Pilih **Verifikasi Identitas**.
5. Bila mengambil foto, tekan **Buka Kamera**, izinkan akses, dan tekan tombol kamera. Anda juga dapat menggunakan **Pilih dari Galeri**.
6. Periksa foto, lalu tekan **Konfirmasi**. Jika tanpa foto awal, tersedia **Lewati Verifikasi**.
7. Tekan **Mulai Tracking**. Jika dialog verifikasi baru muncul setelah tombol ditekan, selesaikan dialog, lalu tekan **Mulai Tracking** kembali.
8. Pastikan judul berubah menjadi **Inspeksi Berlangsung** dan penghitung durasi berjalan.

**Foto awal bersifat opsional pada versi ini.** Gunakan sesuai ketentuan dokumentasi internal. Penanda “Terverifikasi” menunjukkan konfirmasi pada aplikasi, bukan hasil pemeriksaan biometrik otomatis.

Jika panel menutupi peta, gunakan tombol **Perkecil/Perluas** pada panel persiapan. Jika muncul **Bypass Mode (deployment testing)**, itu kontrol pengujian; jangan mengaktifkannya untuk inspeksi operasional. Laporkan kemunculannya kepada pengelola.

### 7.4 Selama inspeksi berlangsung

Layar menampilkan **Duration** (durasi), **Jarak** (akumulasi jalur GPS), dan **Accuracy**. Posisi baru dikirim secara berkala saat GPS dan koneksi tersedia.

1. Pertahankan halaman terbuka pada perangkat yang sama.
2. Periksa bahwa GPS tetap terbaca dan durasi berjalan.
3. Gunakan tombol peringatan untuk melapor ketika menemukan kendala.
4. Gunakan **ALERT KERETA** ketika perlu memperingatkan PPJ lain sesuai kejadian di lapangan.
5. Selesaikan inspeksi melalui tombol yang disediakan setelah tiba di titik akhir.

Apabila halaman termuat ulang, aplikasi berusaha memulihkan sesi aktif. Sebagian jejak perjalanan tersimpan pada browser perangkat tersebut. Hindari menghapus data browser, keluar akun, atau berpindah perangkat di tengah perjalanan karena jejak rute dapat tidak pulih seluruhnya.

### 7.5 Mengirim laporan kendala

1. Saat tracking aktif, tekan tombol berikon segitiga peringatan.
2. Pada **Lapor Kendala Darurat**, pilih **Kategori Kendala** yang sesuai. Selalu pilih kategori secara eksplisit.
3. Isi **Deskripsi Kendala** dengan lokasi yang mudah dikenali, kondisi yang terlihat, serta keterangan lapangan. Batas deskripsi adalah 5.000 karakter.
4. Tekan **Ambil Foto Kondisi** bila akan melampirkan foto. Periksa hasil dan ambil ulang jika kurang jelas.
5. Pastikan GPS terbaca, kemudian tekan **Kirim Laporan**.
6. Tunggu pesan **Laporan berhasil dikirim!** sebelum menganggap laporan sudah tercatat.

Contoh deskripsi: “Pada jalur Sta. Yogyakarta menuju Sta. Lempuyangan, terlihat hambatan di sisi jalur dekat titik pemeriksaan. Lokasi dan kondisi terlampir pada foto. Mohon pemeriksaan lanjutan.” Sesuaikan dengan kejadian sebenarnya dan prosedur pelaporan KAI.

Nama kategori mengikuti pengaturan Admin/KUPT. Kategori merah dapat memicu sirine pada dashboard pengelola yang mengaktifkannya; kategori biru tetap dicatat. Foto temuan dan deskripsi tidak dipaksa wajib oleh formulir, tetapi lengkapi sesuai kebutuhan pelaporan internal.

Laporan menggunakan koordinat GPS ketika dikirim. Tidak tersedia menu untuk mengedit atau menghapus laporan yang telah terkirim dari layar PPJ. Jika ada kesalahan, hubungi pengelola dengan menyebutkan ID tugas dan waktu laporan.

### 7.6 Mengirim dan menerima ALERT KERETA

**Mengirim peringatan:**

1. Pastikan tracking aktif dan GPS terbaru tersedia.
2. Tekan tombol berikon pengeras suara bertuliskan **ALERT KERETA**.
3. Baca pesan hasil pengiriman. Pesan berhasil menyebutkan jumlah PPJ penerima.
4. Jika perlu mengirim lagi, tunggu minimal **30 detik**.

Sistem memilih PPJ terdekat pada masing-masing sisi untuk setiap pasangan jalur terkait. Jalur terkait adalah jalur yang berbagi setidaknya satu nama titik/stasiun dengan jalur pengirim, termasuk arah terbalik dan jalur sambungan. Penerima harus sedang tracking dengan pembaruan lokasi maksimal sekitar dua menit terakhir. Karena pemilihan dilakukan per pasangan jalur, penerima dapat lebih dari dua orang secara keseluruhan.

**Menerima peringatan:** saat tracking aktif, PPJ yang terpilih dapat menerima banner **Warning dari [nama]**, bunyi, dan pembacaan arah kereta. Arah yang disebutkan mengambil titik akhir tugas pengirim. Periksa informasi dan jalankan prosedur keselamatan lapangan KAI. Ikon **X** menutup banner di layar.

Warning berlaku sekitar dua menit dan diperiksa berkala, sekitar sepuluh detik saat halaman aktif. Pesan berhasil berarti sistem menyimpan peringatan untuk penerima terpilih; bukan bukti semua penerima telah membaca atau mendengarnya. Jika tidak ada penerima memenuhi syarat, aplikasi menampilkan pesan kegagalan.

Banner **Kereta Lewat: [nama kereta]** juga dapat muncul berdasarkan jadwal kereta yang sudah tersimpan. Informasi itu berbasis jadwal, bukan pelacakan posisi kereta langsung. Tidak adanya banner tidak berarti jalur dipastikan bebas kereta.

### 7.7 Menyelesaikan inspeksi

1. Tiba di titik akhir penugasan.
2. Tekan **Selesai Inspeksi**.
3. Periksa ringkasan durasi, jarak, akurasi, dan **Jarak ke Titik Akhir**.
4. Pastikan GPS menunjukkan posisi dalam radius **500 meter dari titik akhir**.
5. Pada **Verifikasi Identitas Akhir**, ambil foto melalui **Buka Kamera** atau **Pilih dari Galeri**.
6. Periksa foto, lalu tekan **Konfirmasi Selesai**.
7. Tunggu sampai halaman **Detail Inspeksi** terbuka dengan status **Menunggu Approval Admin**.

> **Foto akhir diperlukan untuk mengaktifkan Konfirmasi Selesai pada alur normal versi ini**, meskipun bagian foto menampilkan tulisan “opsional”. Bila tombol belum aktif, periksa foto akhir dan jarak GPS ke titik akhir.

Jika pengiriman gagal, jangan menganggap inspeksi sudah selesai di sistem. Periksa koneksi dan status sesi sebelum mencoba kembali. Menutup dialog dengan **Batal** membiarkan inspeksi tetap berlangsung.

### 7.8 Melihat riwayat dan mengunduh hasil

1. Pada halaman detail selesai, periksa jalur, waktu, durasi, peta GPS bila tersedia, dan daftar kendala.
2. Pilih **Kembali ke Daftar Tugas → Riwayat** untuk melihat hasil yang sudah dikirim.
3. Kartu kuning **Butuh Approval** berarti hasil masih menunggu persetujuan.
4. Tekan **Lihat Laporan** pada kartu untuk membaca ringkasan.
5. Setelah disetujui, status berubah menjadi **Selesai/Tracking Approved** dan tombol **Download PDF** atau **Download Laporan PDF** dapat digunakan.
6. Simpan berkas pada lokasi penyimpanan yang ditetapkan KAI.

Halaman detail selesai memeriksa pembaruan berkala. Jika riwayat masih menampilkan status lama, buka ulang halaman. Hasil yang telah dikirim tidak dapat dibuka kembali untuk melanjutkan tracking.

### 7.9 Saat internet terputus

Jika muncul banner **Offline Mode**, pertahankan halaman terbuka dan pulihkan koneksi. Pada alur aktif versi ini, pengiriman mulai/selesai tracking, laporan, dan warning tetap memerlukan koneksi ke server; banner tidak menjamin semuanya masuk antrean otomatis.

Setelah koneksi pulih, periksa status tugas dan pesan keberhasilan. Koordinasikan dengan pengelola jika ragu apakah laporan terkirim agar tidak mengirim duplikat. Jangan membersihkan data browser ketika sesi belum selesai. Bila membutuhkan komunikasi segera, ikuti sarana komunikasi dan prosedur operasional KAI yang berlaku.

## 8. Tutorial Guest

1. Dari halaman login, pilih **Masuk Sebagai Guest**.
2. Pastikan label **Guest** dan **Mode Publik** terlihat.
3. Gunakan tombol **+ / −** dan geser peta untuk melihat jalur.
4. Arahkan penunjuk atau sentuh titik stasiun untuk membaca namanya.
5. Gunakan **Masuk** di kanan atas bila akan kembali ke akses akun.

Peta publik menampilkan 14 stasiun pada lintas **Sta. Jenar–Sta. Kedungbanteng**, dengan garis jalur berwarna biru. Area pergeseran peta dibatasi pada lintas yang ditampilkan. Garis putus-putus dapat muncul sebagai pengganti jika bentuk jalur rinci belum berhasil dimuat.

Guest tidak menampilkan posisi PPJ, identitas/NIPP petugas, daftar tugas, foto temuan, laporan PDF, ataupun kontrol pengelolaan. Akun dengan role Guest juga diarahkan ke peta publik ini; akun Guest tidak membuka fitur pengawasan tambahan.

## 9. Membaca dan menyimpan laporan PDF

### 9.1 Cara memperoleh PDF

| Pengguna | Langkah |
| --- | --- |
| Admin/KUPT | Buka Tugas → pilih kartu → Detail Inspeksi → Download Laporan PDF. |
| PPJ | Buka hasil inspeksi atau Riwayat → Lihat Laporan → Download PDF setelah approval. |
| QC | Minta berkas dari Admin/KUPT pengelola; halaman QC belum menyediakan tombol unduh. |
| Guest | Tidak tersedia. |

Berkas diunduh dengan pola nama `Laporan_Inspeksi_PPJ_[ID tugas].pdf`. Periksa daftar unduhan browser bila file tidak langsung terbuka.

### 9.2 Yang perlu diperiksa

- Identitas petugas, ID tugas, tanggal, dan jalur.
- Waktu mulai/selesai dan durasi inspeksi.
- Jejak/peta perjalanan bila datanya tersedia.
- Temuan, deskripsi, koordinat, serta foto yang dilampirkan.
- Status **APPROVED** atau **NOT APPROVED**.
- Status keselamatan **AMAN** atau **TIDAK AMAN**.

Admin/KUPT dapat mengunduh PDF sebelum approval untuk peninjauan. Perlakukan berkas **NOT APPROVED** sebagai draft. Setelah hasil disetujui, unduh kembali untuk memperoleh status terbaru; berkas yang sudah disimpan tidak berubah otomatis.

Simpan dan bagikan laporan sesuai aturan internal karena berisi identitas petugas, lokasi, dan dokumentasi pemeriksaan. Untuk mencetak, buka PDF pada pembaca dokumen lalu gunakan fungsi cetak.

## 10. Penanganan kendala umum

| Kendala | Langkah yang dapat dilakukan |
| --- | --- |
| Login gagal / Invalid credentials | Periksa NIPP dan password; pastikan akun aktif melalui Super Admin. |
| Terlalu banyak percobaan login | Hentikan percobaan berulang dan tunggu sebelum mencoba lagi. Pembatasan login memakai jendela waktu 15 menit. |
| Lupa password | Minta Super Admin mengganti password melalui edit akun. Tautan pemulihan mandiri belum berfungsi. |
| Halaman kembali ke login | Masuk kembali. Jika tetap gagal, periksa status aktif akun dengan Super Admin. |
| Menu tidak sama dengan panduan role lain | Periksa role akun. Menu memang dibatasi menurut kewenangan. |
| Daftar petugas/tugas Admin atau KUPT kosong | Periksa pembagian petugas kelolaan, lalu pencarian/filter tanggal/status. Pembuatan akun PPJ saja belum menambahkan kelolaan. |
| Petugas tidak muncul saat ditambahkan | Pastikan akun PPJ ada dan belum dikelola pihak lain. Koordinasikan perpindahan melalui Super Admin. |
| Data QC kosong | Periksa wilayah yang diberikan, pilih Semua Jalur, dan pastikan ada tugas yang terkait stasiun wilayah tersebut. |
| Data hilang saat memilih satu wilayah QC | Filter juga membaca nama stasiun dalam nama jalur. Minta pengelola memeriksa penamaan jalur. |
| PPJ belum melihat tugas baru | Pastikan penugasan memakai NIPP yang benar, lalu buka ulang halaman Tugas. |
| Mulai Tracking tidak aktif | Periksa jam mulai, GPS, radius 500 meter titik awal, dan status tugas. |
| GPS tidak ditemukan | Aktifkan lokasi perangkat, izinkan lokasi pada situs, periksa koneksi, dan tunggu pembacaan di lokasi yang memungkinkan penerimaan GPS. |
| Kamera tidak dapat diakses | Periksa izin kamera dan alamat HTTPS; tutup aplikasi lain yang memakai kamera. Untuk foto awal/akhir, gunakan Pilih dari Galeri bila sesuai prosedur. |
| Konfirmasi Selesai tidak aktif | Lengkapi foto akhir dan pastikan GPS berada dalam radius 500 meter titik akhir. |
| Laporan/penyelesaian gagal dikirim | Pulihkan koneksi, periksa apakah data sudah tersimpan, lalu coba kembali bila belum berhasil. Jangan menganggap banner offline sebagai bukti penyimpanan. |
| Tidak ada penerima ALERT KERETA | Penerima harus memiliki tracking aktif, jalur terkait, dan posisi terbaru. Periksa pesan aplikasi dan koordinasikan melalui sarana operasional yang tersedia. |
| Diminta menunggu 30 detik | Tunggu jeda pengiriman warning sebelum mencoba lagi. |
| Fitur warning belum siap di server | Sampaikan pesan lengkap kepada penanggung jawab teknis; tidak dapat diperbaiki melalui menu pengguna. |
| Sirine Admin/KUPT tidak berbunyi | Periksa Setting, volume perangkat, izin suara browser, dan tingkat kategori. Alarm ditujukan untuk laporan darurat baru setelah halaman aktif. |
| QC tidak mendengar sirine | Halaman QC saat ini tidak menyediakan alarm suara; pantau marker dan detail insiden. |
| PDF PPJ terkunci | Hasil belum approved. Periksa status dan hubungi pengelola; khusus kelolaan KUPT, baca batasan approval. |
| Tombol approval tidak terlihat | Pastikan akun Admin, tracking sudah selesai, belum approved, dan petugas berada dalam kelolaan Admin tersebut. |
| Angka Laporan Darurat tidak sesuai jumlah insiden | Baca daftar/detail insiden. Ringkasan darurat belum menghitung semua kategori dinamis secara seragam. |
| Import Excel gagal | Gunakan template terbaru, format .xlsx, ukuran maksimal 5 MB, kolom tetap, NIPP aktif, tanggal valid, dan titik yang dikenali. |
| Import hanya berhasil sebagian | Baca pesan per baris; unggah ulang hanya baris gagal setelah diperbaiki. |
| Peta atau garis jalur tidak muncul | Periksa koneksi dan tunggu pemuatan. Bila berlanjut, kirim informasi waktu, halaman, serta jalur kepada pengelola. |
| Foto login tidak terlihat pada ponsel | Panel foto memang hanya ditampilkan pada layar desktop yang cukup lebar. |
| Foto login tidak berganti di desktop | Periksa status aktif, jumlah foto, dan preferensi pengurangan gerakan pada perangkat. |
| Hapus akun ditolak | Periksa apakah akun Admin/akun sendiri atau masih memiliki inspeksi aktif. Selesaikan koordinasi operasional sebelum penghapusan. |

## 11. Daftar periksa operasional

### Admin/Super Admin sebelum penugasan

- [ ] Akun pengguna aktif dan role sesuai.
- [ ] Wilayah QC/KUPT serta pembagian petugas sudah benar.
- [ ] Kewenangan approval sudah jelas, terutama untuk kelolaan KUPT.
- [ ] Tanggal, jam, petugas, dan arah titik awal/akhir diperiksa.
- [ ] Baris contoh Excel sudah diganti/dihapus dan hasil import ditinjau.
- [ ] Kategori temuan sesuai penggunaan; suara dipilih bila diperlukan.

### KUPT dan QC saat pemantauan

- [ ] Cakupan petugas atau wilayah yang dilihat sudah benar.
- [ ] Waktu pembaruan posisi diperiksa.
- [ ] Detail insiden dibaca, tidak hanya angka ringkasan.
- [ ] Tindak lanjut dikomunikasikan sesuai prosedur internal.
- [ ] Hasil yang masih Butuh Approval diteruskan kepada pihak yang berwenang.

### PPJ sebelum, selama, dan sesudah inspeksi

- [ ] Akun dan tugas yang digunakan benar.
- [ ] GPS, koneksi, kamera, baterai, dan suara siap digunakan.
- [ ] Waktu mulai dan radius titik awal memenuhi ketentuan.
- [ ] Status Inspeksi Berlangsung dan durasi berjalan sudah terlihat.
- [ ] Setiap laporan yang dikirim telah mendapat pesan berhasil.
- [ ] Foto akhir tersedia dan posisi berada di radius titik akhir.
- [ ] Setelah Konfirmasi Selesai, halaman Menunggu Approval Admin sudah terbuka.
- [ ] Setelah approval, status keselamatan diperiksa dan PDF disimpan.

## 12. Catatan versi aplikasi

Bagian ini menjelaskan perilaku yang perlu diketahui saat menggunakan versi yang ditinjau. Ini bukan daftar langkah perubahan sistem.

| Kondisi versi ini | Implikasi bagi pengguna |
| --- | --- |
| Admin/Super Admin adalah satu role. | Tidak perlu mencari jenis login Super Admin terpisah. |
| Dashboard Admin dibatasi petugas kelolaan. | Tugas KUPT tidak otomatis tersedia untuk approval Admin. Alur ini perlu dipastikan sebelum operasional penuh. |
| Foto akhir berlabel opsional, tetapi tombol selesai memerlukannya. | Sediakan foto akhir untuk menyelesaikan inspeksi melalui alur normal. |
| Guest hanya menampilkan peta jalur/stasiun. | Guest bukan pengganti dashboard pemantauan PPJ. |
| Halaman QC tidak memiliki unduh PDF, approval, atau sirine. | Gunakan pemantauan visual dan koordinasikan kebutuhan dokumen kepada pengelola. |
| Lupa Password belum menjalankan proses pemulihan. | Pemulihan akun dilakukan melalui Super Admin/penanggung jawab teknis. |
| Banner offline tidak menjamin semua aksi tersimpan otomatis. | Pastikan transaksi memperoleh respons berhasil dan status akhirnya benar. |
| Kategori dipakai bersama dan hapus kategori bersifat permanen. | Koordinasikan perubahan; laporan lama dapat menampilkan key setelah kategorinya dihapus. |
| Angka darurat masih menggunakan kategori tertentu, sedangkan daftar insiden lebih luas. | Jangan memakai angka ringkasan sebagai satu-satunya acuan keberadaan laporan. |
| Peringatan jadwal kereta dapat muncul, tetapi menu pengelolaan jadwal kereta tidak tersedia pada dashboard. | Hubungi pengelola untuk kebutuhan data jadwal; banner bukan informasi posisi kereta langsung. |
| Bypass Mode dapat terlihat bergantung pengaturan pemasangan aplikasi. | Gunakan alur normal; penanggung jawab teknis perlu memastikan kontrol pengujian tidak digunakan dalam operasional. |

Panduan disusun dari penelusuran halaman aktif, komponen, aturan akses, pengolahan data, dan validasi pada kode proyek. Dokumen ini tidak menyatakan bahwa setiap langkah telah diuji menggunakan akun pada server produksi. Saat serah terima, cocokkan versi aplikasi yang dipasang dan lakukan simulasi bersama perwakilan tiap role.

## 13. Informasi bantuan dan serah terima

Lengkapi informasi berikut saat penyerahan aplikasi:

| Informasi | Diisi oleh pengelola |
| --- | --- |
| Alamat resmi website | … |
| Unit penanggung jawab | … |
| Kontak Super Admin | … |
| Kontak penanggung jawab teknis | … |
| Kanal pelaporan gangguan aplikasi | … |
| Lokasi penyimpanan arsip PDF | … |
| Prosedur approval untuk petugas kelolaan KUPT | … |
| Tanggal dan versi aplikasi saat serah terima | … |

Saat meminta bantuan, sertakan **role**, **nama/NIPP**, **ID tugas**, **jalur**, **tanggal/jam kejadian**, **pesan kesalahan**, dan **langkah sebelum masalah muncul**. Lampirkan tangkapan layar bila diperlukan, tanpa menyertakan password.

Untuk simulasi serah terima, gunakan data latihan yang disepakati: buat akun, tetapkan kelolaan, buat satu tugas, lakukan inspeksi dan laporan, kirim penyelesaian, periksa approval, lalu unduh PDF. Pastikan batas akses QC dan Guest juga dipahami. Pelaksanaan pemeriksaan dan penanganan kondisi di jalur tetap mengikuti prosedur operasional KAI.
