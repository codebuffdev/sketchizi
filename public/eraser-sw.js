// Legacy placeholder. Eraser icon caching is handled by /service-worker.js so
// Sketchizi has exactly one root-scoped service worker registration.
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
