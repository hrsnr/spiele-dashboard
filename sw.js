// ⚠️ WICHTIG: Erhöhe diese Versionsnummer (z. B. v1 -> v2) bei JEDER Änderung!
const CACHE_NAME = 'spiele-dashboard-v13.1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './theme.js',
  './tournament.js',
  './manifest.json',
  './spiele/cabo.html',
  './spiele/charlie_run.html',
  './spiele/Testspiele/charlie_run_deluxe.html',
  './spiele/flappy_henri.html',
  './spiele/Testspiele/flappy_henri_deluxe.html',
  './spiele/flip7.html',
  './spiele/flip7_v2.html',
  './spiele/kniffel.html',
  './spiele/minigolf.html',
  './spiele/moelkky.html',
  './spiele/qwirkle.html',
  './spiele/theken_tim.html',
  './spiele/Testspiele/theken_tim_deluxe.html',
  './spiele/tutto.html',
  './spiele/wizard.html',
  './spiele/wuerfel_auswahl.html',
  './spiele/yatzy.html'
];

// 1. Installation: Neue Dateien cachen und SOFORT aktivieren
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Erzwingt, dass der neue SW sofort aktiv wird
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Aktivierung: Alte Caches automatisch löschen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Lösche alten Cache:', cache);
            return caches.delete(cache); // Löscht v1, wenn v2 aktiv wird
          }
        })
      );
    }).then(() => self.clients.claim()) // Übernimmt sofort alle geöffneten Tabs
  );
});

// 3. Fetch: Network-First für lokale Assets (Cloud-Sync immer direkt ans Netz)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

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
    fetch(event.request)
      .then((networkResponse) => {
        // Wenn eine Netzwerkverbindung steht: Cache im Hintergrund aktualisieren & neueste Seite anzeigen
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Wenn kein Netz da ist: Aus dem Cache laden (Offline-Modus)
        return caches.match(event.request);
      })
  );
});
