// 골프 샷 자동 컷 — service worker: offline shell + "공유" target from the gallery.
const VERSION = 'golfcut-v1';
const SHARE_CACHE = 'golfcut-share';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== SHARE_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Videos shared from the gallery: park them in a cache, then open the app.
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const files = form.getAll('videos').filter(f => f && typeof f !== 'string');
      const cache = await caches.open(SHARE_CACHE);
      for (const k of await cache.keys()) await cache.delete(k);
      let i = 0;
      for (const f of files) {
        await cache.put(new Request(new URL(`./shared/${i++}`, self.registration.scope)), new Response(f, {
          headers: {
            'content-type': f.type || 'video/mp4',
            'x-name': encodeURIComponent(f.name || `video_${i}.mp4`),
            'x-modified': String(f.lastModified || 0),
          },
        }));
      }
      return Response.redirect(new URL(`./?shared=${files.length}`, self.registration.scope).href, 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;
  // Page: network first (so updates arrive), cache when offline. Other files: cache first.
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(e.request);
        const c = await caches.open(VERSION); c.put('./index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
