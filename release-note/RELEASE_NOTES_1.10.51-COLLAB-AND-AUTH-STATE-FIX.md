# Sketchizi 1.10.51 — Collaboration Endpoint and Stale Sign-in Error Fix

- Clears the stale Google sign-in error once the authentication service confirms an authenticated session, and when a new Google sign-in attempt begins.
- Requires deployed builds to set `VITE_COLLAB_WS_URL` instead of silently falling back to the static frontend origin.
- Validates WebSocket scheme, HTTPS compatibility, and the `/collaboration` path before opening the socket, producing actionable errors for misconfiguration.
- Makes connection timeout guidance point to the deployed WebSocket endpoint and the collaboration server health endpoint.
- Keeps local development fallback behavior on localhost.
