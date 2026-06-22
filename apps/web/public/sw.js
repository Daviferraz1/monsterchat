// Service worker mínimo do MonsterChat (PWA instalável).
// Estratégia: network-first APENAS para navegações (HTML). Não intercepta assets,
// _next, APIs nem requisições do Supabase — assim o app continua sempre atualizado
// e o tempo real não é afetado. O cache só serve de fallback quando está offline.
const CACHE = 'monsterchat-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.add('/offline.html').catch(() => {});
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
        return res;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        const offline = await caches.match('/offline.html');
        return (
          offline ||
          new Response('Você está offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
        );
      }
    })()
  );
});
