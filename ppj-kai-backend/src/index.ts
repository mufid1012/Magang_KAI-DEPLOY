import { createApp } from './app';
import { ensureDefaultKategoriTemuan } from './lib/defaultKategori';
import { startMissedTaskScheduler } from './lib/scheduler';

const port = Number(process.env.PORT) || 5001;
// Bind ke loopback saja: akses publik harus lewat nginx (rate limit, header proxy, TLS).
// Set HOST=0.0.0.0 bila memang perlu mendengarkan di semua antarmuka.
const host = process.env.HOST || '127.0.0.1';

const boot = async () => {
  // Data referensi wajib: tanpa kategori, semua laporan kendala ditolak 400.
  await ensureDefaultKategoriTemuan();
  createApp().listen(port, host, () => {
    console.log(`Server is running on ${host}:${port}`);
    startMissedTaskScheduler();
  });
};

void boot();
