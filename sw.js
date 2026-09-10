// Twister — service worker (offline cache for the home-screen app)
// DEPLOY RULE: bump BUILD on every deploy. The cache name derives from it, so one line forces a clean swap.
const BUILD = '2026-09-10-twister-v4';
const CACHE = 'twisty-' + BUILD;
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// On activate: drop every older 'twisty-' cache (prefix-scoped so other apps on the same github.io origin are
// untouched) and take control of open pages. A device pinned to the previous build gets this worker on its next
// launch (the browser re-fetches sw.js and sees a byte change), which swaps the cache; the launch after that
// serves the new page. Pages built from this version also reload themselves once when a new worker takes over.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('twisty-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for instant offline launch. New builds are picked up because BUILD changes the cache name and the
// browser re-fetches sw.js on navigation; skipWaiting + claim above hand control to the new build.
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
