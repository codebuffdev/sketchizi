# Sketchizi 1.1.3 — Eraser Library Network Fix

## What changed

- Eraser catalog discovery now falls back to the official Eraser icon documentation page when the Google Cloud Storage JSON endpoint cannot be resolved.
- Eraser icon requests now use a same-origin `/api/eraser-icon` path with a fallback through `wsrv.nl`, which supports SVG origin images.
- Vite development/preview servers now provide the Eraser API routes locally; the previous Vite `server.proxy` to `storage.googleapis.com` has been removed.
- Cloudflare Pages functions use the same fallback strategy.
- `npm run sync:eraser` is now resilient: it prefers direct Google Storage, falls back to the Eraser docs catalog and an SVG image proxy, skips icons already present locally, records failures, and writes the manifest even if some downloads fail.
- The browser offline cache already targets the same-origin icon route, so the existing “Make available offline” action can cache the resolved SVG responses.
