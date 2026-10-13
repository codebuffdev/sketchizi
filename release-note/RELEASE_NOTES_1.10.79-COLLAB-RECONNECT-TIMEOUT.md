# Sketchizi 1.10.79 — Collaboration reconnect hardening

## Changes
- Bound host authorization refresh during host reconnection to 10 seconds.
- On refresh timeout/failure, report a user-visible error and close the unjoined socket so the existing reconnect path can retry.
- Preserve exponential backoff across successful WebSocket handshakes; reset it only after the server acknowledges the collaboration join.
- Keep collaboration protocol, permissions, UI layout, AI, and authentication implementation unchanged.

## Verification
- `npm run test:sync`: 35 passed.
- Collaboration creation-error, endpoint, and host-auth tests: 18 passed.
- Production build not verified because Excalidraw font assets were missing from `node_modules`; run `npm ci` then `npm run build`.

## Scope
This patch addresses one confirmed client-side failure path; it does not establish that all intermittent disconnects or synchronization latency are resolved. Continue investigating server transport errors and room recovery with end-to-end tests.
