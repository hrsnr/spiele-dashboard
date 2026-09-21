const CACHE_NAME = 'spiele-dashboard-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './spiele/wizard.html',
  './spiele/flip7.html',
  './spiele/moelkky.html',
  './spiele/minigolf.html',
  './spiele/flappy_henri.html'
];

// Installation & Caching aller Dateien
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Anfragen im Offline-Fall direkt aus dem Cache bedienen
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
