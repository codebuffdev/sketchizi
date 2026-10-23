# Sketchizi 1.1.2 — Eraser Library Fix

- Eraser catalog now loads through a same-origin Vite/Cloudflare proxy instead of a browser CORS-dependent GCS catalog request.
- The latest successful catalog is persisted in localStorage so the library can reopen offline.
- Eraser icon URLs use the same-origin icon proxy, which gives Excalidraw a reliable fetch path.
- Browser caching uses the existing root service worker; Sketchizi no longer registers two competing service workers at `/`.
- “Make available offline” caches the Eraser icon responses and reports how many are available offline.
- Icon insertion converts the SVG response to a self-contained data URL before registering it with Excalidraw.
