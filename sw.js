/* Classifica Trilha 2.0 — service worker (funcionamento offline)
   Estratégia: tudo é pré-armazenado na instalação; depois usa o cache primeiro
   e atualiza em segundo plano. Para publicar uma nova versão, altere VERSION. */
const VERSION = '2.0.1';
const CACHE = 'classifica-trilha-v' + VERSION;
const ASSETS = [
  './', './index.html', './styles.css?v=201', './core.js?v=201', './tracks.js?v=201', './charts.js?v=201',
  './db.js?v=201', './app.js?v=201', './manifest.webmanifest?v=201',
  './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './icon-severity.svg', './icon-orientation.svg', './icon-terrain.svg', './icon-effort.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('classifica-trilha-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const refresh = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(refresh); return hit; }
    const res = await refresh;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  })());
});
