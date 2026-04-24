// ============================================================
//  RajMart – Amul Milk Manager  |  sw.js  (Service Worker)
//  Cache-first strategy – runs fully offline after first load
// ============================================================

const CACHE_NAME = 'amul_daily_v4';

// All files that must be cached for offline use
const CACHE_ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/favicon-64.png'
];

// Google Fonts URLs – cached so app works offline after first load
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@700&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap'
];

// ─── INSTALL: cache all app assets ───────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing – caching app assets…');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache core app files (must succeed)
      return cache.addAll(CACHE_ASSETS)
        .then(() => {
          // Cache Google Fonts separately (network optional – don't block install)
          return Promise.allSettled(
            FONT_URLS.map(url =>
              fetch(url, { mode: 'cors' })
                .then(res => res.ok ? cache.put(url, res) : null)
                .catch(() => null) // silently fail if no network
            )
          );
        });
    }).then(() => {
      console.log('[SW] All assets cached.');
      return self.skipWaiting(); // activate immediately
    })
  );
});

// ─── ACTIVATE: delete old caches ─────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating…');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim()) // take control immediately
  );
});

// ─── FETCH: serve from cache first, fall back to network ─────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache immediately
        // In background, try to refresh font/CSS from network
        if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
          fetch(event.request)
            .then(res => {
              if (res && res.ok) {
                caches.open(CACHE_NAME).then(c => c.put(event.request, res));
              }
            })
            .catch(() => {}); // ignore – we already have cached version
        }
        return cached;
      }

      // Not in cache – try network and cache the response
      return fetch(event.request)
        .then(networkRes => {
          if (
            networkRes &&
            networkRes.ok &&
            networkRes.type !== 'opaque' // don't cache opaque cross-origin responses
          ) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
          }
          return networkRes;
        })
        .catch(() => {
          // Complete offline fallback – return index.html for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          // For other assets, return a minimal offline response
          return new Response('Offline – resource not cached.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
    })
  );
});

// ─── MESSAGE: force cache refresh on demand ──────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_REFRESH') {
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        CACHE_ASSETS.map(url =>
          fetch(url, { cache: 'reload' })
            .then(res => res.ok ? cache.put(url, res) : null)
            .catch(() => null)
        )
      );
    }).then(() => {
      event.source && event.source.postMessage({ type: 'CACHE_REFRESHED' });
    });
  }
});
