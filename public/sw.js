const CACHE = 'pulsepoint-shell-v4';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-180.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('pulsepoint-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isShell = url.pathname === '/' && event.request.mode === 'navigate';
  const isAsset = /\.(js|css|woff2?|svg)$/.test(url.pathname) && !url.pathname.includes('/api/');
  if (!isShell && !isAsset) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && !response.redirected) {
      const clone = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(isShell ? '/' : event.request, clone)));
    }
    return response;
  }).catch(() => caches.match(isShell ? '/' : event.request).then(cached => cached || new Response('Offline asset unavailable. Откройте ЭКГ телеметрию при подключении к интернету.', {status:503}))));
});
