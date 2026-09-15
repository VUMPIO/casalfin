const CACHE = 'casalfin-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // Um recurso que falhe não pode derrubar a instalação inteira.
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isShell = url.origin === self.location.origin
    || url.href.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js');
  // Chamadas ao Supabase (dados) nunca passam pelo cache.
  if (!isShell) return;

  // HTML: rede primeiro, pra que um deploy novo apareça sem esperar cache expirar.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html'))),
    );
    return;
  }

  // Demais recursos do app: cache primeiro, com atualização em segundo plano.
  event.respondWith(
    caches.match(request).then(hit => {
      const network = fetch(request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
