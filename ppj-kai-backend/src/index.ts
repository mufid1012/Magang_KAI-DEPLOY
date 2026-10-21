import { createApp } from './app';
import { startMissedTaskScheduler } from './lib/scheduler';

const port = process.env.PORT || 5001;
// Bind ke loopback saja: akses publik harus lewat nginx (rate limit, header proxy, TLS).
// Set HOST=0.0.0.0 bila memang perlu mendengarkan di semua antarmuka.
const host = process.env.HOST || '127.0.0.1';
createApp().listen(port, host, () => {
  console.log(`Server is running on ${host}:${port}`);
  startMissedTaskScheduler();
});
