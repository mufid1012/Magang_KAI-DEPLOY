// Cleanup worker for clients that previously installed the legacy Workbox PWA.
// The application remains online-first; PPJ tracking recovery is handled by
// localStorage and the backend active-tracking endpoint.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
