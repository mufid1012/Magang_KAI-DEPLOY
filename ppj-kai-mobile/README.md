# PPJ KAI — aplikasi Android

Pembungkus Android (Capacitor) untuk https://ppjtracking.daop6.id. Tujuannya satu: GPS inspeksi tetap
tercatat saat layar HP mati atau aplikasi diminimalkan, hal yang tidak bisa dilakukan browser.

- Aplikasi memuat situs produksi (`server.url` di `capacitor.config.json`), jadi setiap deploy Vercel
  langsung terpakai tanpa memasang ulang APK. APK baru hanya perlu bila bagian native berubah.
- Di halaman inspeksi, `ppj-kai-frontend/src/hooks/useGPS.ts` memakai plugin
  `@capacitor-community/background-geolocation` (layanan latar depan + notifikasi "Tracking inspeksi PPJ aktif").
  Di browser biasa tetap memakai GPS browser.
- Saat layar mati, timer halaman berhenti setelah ±30 detik tetapi callback GPS tetap jalan, jadi
  `TelemetryCard` mengunggah antrean dari callback GPS.
- `MainActivity` meminta izin notifikasi (Android 13+) dan pengecualian optimasi baterai.

## Build

Butuh JDK 21 dan Android SDK (platform 36).

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
npm ci
npm run apk:debug   # hasil: android/app/build/outputs/apk/debug/app-debug.apk
```

APK rilis butuh keystore sendiri (jangan di-commit, simpan cadangannya: tanpa keystore yang sama,
update tidak bisa dipasang di atas versi lama):

```bash
keytool -genkey -v -keystore ppjkai-release.jks -alias ppjkai -keyalg RSA -keysize 2048 -validity 10000
cd android && ./gradlew assembleRelease   # lalu tanda tangani dengan apksigner memakai keystore di atas
```

## Pemasangan di HP PPJ

1. Pasang APK, izinkan "instal dari sumber tidak dikenal".
2. Saat diminta: izinkan lokasi ("Saat aplikasi digunakan" cukup), notifikasi, dan "jangan optimalkan baterai".
3. Xiaomi/Oppo/Vivo/Realme: aktifkan juga *Autostart* dan set baterai aplikasi ke "Tanpa batasan"
   di pengaturan HP; layar ini berbeda per merek dan tidak bisa dibuka otomatis.
