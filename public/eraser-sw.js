const CACHE_NAME = 'diagram-app-eraser-icons-v1';
const ERASER_HOST = 'storage.googleapis.com';
const ERASER_PATH = '/eraser-public-assets/canvas-icons/';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.hostname !== ERASER_HOST || !url.pathname.startsWith(ERASER_PATH)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) cache.put(event.request, response.clone());
    return response;
  })());
});
