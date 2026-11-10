// Service Worker v14.0 (Online-Modus für GitHub Pages & Google-Drive-Sync)
// Löscht alte Offline-Caches automatisch und lädt Seiten/Assets immer frisch vom Server.
const SW_VERSION = 'spiele-dashboard-v14.0';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(cacheNames.map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return;

  try {
    const reqUrl = new URL(event.request.url);
    if (
      reqUrl.origin !== self.location.origin ||
      reqUrl.hostname.includes('script.google.com') ||
      reqUrl.hostname.includes('script.googleusercontent.com') ||
      reqUrl.hostname.includes('drive.google.com')
    ) {
      return;
    }
  } catch (e) {
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' }).catch(() => fetch(event.request))
  );
});
