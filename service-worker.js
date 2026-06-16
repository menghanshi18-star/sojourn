/* Sojourn — service worker
   Strategy:
   - Pre-cache shell on install.
   - Network-first for HTML (so updates land fast); cache-first for everything else.
   - Bump CACHE version to ship updates.
*/
const CACHE = 'sojourn-v1';

// Relative URLs so this also works under a GitHub Pages subpath
// (e.g. https://user.github.io/sojourn/).
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './i18n.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // addAll fails the whole batch if any asset is missing —
      // so add them individually and ignore individual failures
      // (e.g. icons not yet generated).
      Promise.all(SHELL.map(url =>
        c.add(url).catch(() => null)
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only manage same-origin requests.
  if (url.origin !== self.location.origin) return;

  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first for HTML so updates ship.
    e.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for assets.
  e.respondWith(
    caches.match(req).then(cached =>
      cached ||
      fetch(req).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => cached)
    )
  );
});
