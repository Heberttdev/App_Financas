const CACHE_NAME = 'dividas-v9';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
        '/icon-512.png'
      ]);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Não tenta cache para requisições do Firebase
  if (event.request.url.includes('firebaseio.com') || 
      event.request.url.includes('googleapis.com')) {
    return;
  }
  
  if (event.request.method !== 'GET') return;

  // Rede primeiro: sempre a versão publicada; o cache só entra sem internet.
  event.respondWith(
    fetch(event.request)
      .then(fetchResponse => {
        if (fetchResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const responseClone = fetchResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return fetchResponse;
      })
      .catch(() =>
        caches.match(event.request).then(response =>
          response || (event.request.mode === 'navigate' ? caches.match('/index.html') : Response.error())
        )
      )
  );
});
