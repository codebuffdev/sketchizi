const CACHE_NAME = 'sketchizi-eraser-icons-v2';
const ERASER_HOST = 'storage.googleapis.com';
const ERASER_PATH = '/eraser-public-assets/canvas-icons/';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.hostname !== ERASER_HOST || !url.pathname.startsWith(ERASER_PATH)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      // Fall back to a no-cors request for public assets whose bucket does
      // not expose CORS headers. Opaque responses can still be cached.
      const response = await fetch(event.request, { mode: "no-cors" });
      await cache.put(event.request, response.clone());
      return response;
    }
  })());
});
