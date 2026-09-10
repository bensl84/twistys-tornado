// Twister — service worker (offline cache for the home-screen app)
// DEPLOY RULE: bump BUILD on every deploy. The cache name derives from it, so one line forces a clean swap.
const BUILD = '2026-09-10-twister-v1';
const CACHE = 'twisty-' + BUILD;
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// On activate: drop every older 'twisty-' cache (prefix-scoped so other apps on the same github.io origin are
// untouched), take control of open pages, and reload them so a device pinned to the previous build (its old
// worker served the cached page before this code could run) gets the new page immediately.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('twisty-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => Promise.all(clients.map(c => c.navigate(c.url).catch(() => null))))
  );
});

// Cache-first for instant offline launch. New builds are picked up because BUILD changes the cache name and the
// browser re-fetches sw.js on navigation; skipWaiting + claim + navigate above hand control to the new build.
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
