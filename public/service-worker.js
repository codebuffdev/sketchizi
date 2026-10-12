const APP_CACHE = "sketchizi-v1.10.68";
const ERASER_CACHE = "sketchizi-eraser-icons-v4";
const APP_SHELL = ["/manifest.webmanifest", "/sketchizi-favicon.svg"];
const LOCAL_ICON_PATH = "/api/eraser-icon";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== APP_CACHE && key !== ERASER_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Personalized authentication and AI traffic must always reach the network. Never cache sessions, CSRF tokens, OAuth callbacks, usage quotas, chat responses, or diagram context.
  if (url.origin === self.location.origin && ((url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) || (url.pathname === "/api/ai" || url.pathname.startsWith("/api/ai/")))) return;

  if (url.origin === self.location.origin && url.pathname === LOCAL_ICON_PATH) {
    event.respondWith((async () => {
      const cache = await caches.open(ERASER_CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        const fallback = await cache.match(event.request);
        if (fallback) return fallback;
        throw error;
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Always fetch document navigations from Cloudflare first. A cached index.html
  // can reference stale or nonexistent bundles and leave the entire app blank.
  if (event.request.mode === "navigate" || event.request.destination === "document") {
    event.respondWith(fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      return cached || new Response("Sketchizi is offline. Reconnect and reload.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response?.ok) {
          const responseForCache = response.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(event.request, responseForCache));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
