const VERSION = 'v1';
const SHELL_CACHE = 'shell-' + VERSION;
const TILE_CACHE  = 'tiles-' + VERSION;
const MAX_TILES = 5000;

const SHELL = [
  './', './index.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function(c) { return Promise.allSettled(SHELL.map(function(u) { return c.add(u); })); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== SHELL_CACHE && k !== TILE_CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isTile = url.hostname === 'tile.openstreetmap.org' || url.hostname.indexOf('.tile.openstreetmap.org') !== -1;
  if (isTile) {
    e.respondWith(cacheFirst(req, TILE_CACHE, MAX_TILES));
  } else if (url.origin === self.location.origin || url.hostname === 'unpkg.com') {
    e.respondWith(cacheFirst(req, SHELL_CACHE));
  } else {
    e.respondWith(fetch(req).catch(function() { return caches.match(req); }));
  }
});

async function cacheFirst(req, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(req, res.clone()).then(function() { if (limit) trimCache(cacheName, limit); }).catch(function() {});
    }
    return res;
  } catch (err) {
    if (req.destination === 'image') {
      return new Response(
        Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), function(c) { return c.charCodeAt(0); }),
        { headers: { 'Content-Type': 'image/gif' } }
      );
    }
    return new Response('Offline', { status: 503 });
  }
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  const toDelete = keys.slice(0, keys.length - max + Math.floor(max * 0.1));
  await Promise.all(toDelete.map(function(k) { return cache.delete(k); }));
}
