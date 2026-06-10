// Twisty's Tornado — service worker (offline cache)
// DEPLOY RULE: bump BUILD on every deploy. Keep it identical to the BUILD string in index.html.
// The cache name is derived from BUILD, so changing this one line forces a clean cache swap.
const BUILD = '2026-06-09-v2';
const CACHE = 'twisty-' + BUILD;
const ASSETS = ['./','./index.html','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

// On activate, delete OUR old caches (prefix-scoped to 'twisty-' so we never touch another app's cache
// on the same github.io origin), then take control. This is what lets a redeploy self-heal instead of
// pinning a stale build on the iPad.
self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k.startsWith('twisty-') && k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

// Cache-first: instant offline (the car scenario). New builds are picked up on the next cold launch
// because the cache name changed and skipWaiting()/clients.claim() hand over control.
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
