# Sketchizi 1.10.52 — Collaboration Service Diagnostics and Auth Error State

## Collaboration creation

- Added structured Node-service logs for WebSocket upgrade requests and rejection, accepted connections, initial join requests, host assertion verification outcomes, room creation/join acknowledgement, socket errors, and close codes/reasons.
- Logged configuration readiness for the host-token secret at startup without logging the secret or the token.
- Added safe, machine-searchable host authorization failure reasons so missing/mismatched secrets, absent assertions, invalid signatures, expired assertions, and room claim mismatches can be distinguished in Render logs.
- Fixed the browser WebSocket client to process server error messages before filtering messages by `roomId`. A rejected `join` should now surface the server's useful rejection message rather than being converted into a 15-second timeout.
- Added client log milestones for WebSocket open, initial join send, join acknowledgement, and close code/reason.

## Authentication banner

- Invalidate any stale in-memory authentication result when returning with an OAuth failure flag.
- Enforce the rule that the OAuth failure message clears and is not rendered while the current server-confirmed auth state is authenticated.

## Deployment notes

- Configure the same `COLLAB_HOST_TOKEN_SECRET` (at least 32 UTF-8 bytes) separately in the Spring Boot auth service and Node collaboration service.
- After deploying, reproduce the issue once and inspect the Node collaboration-service Render logs. If there is no `Collaboration WebSocket upgrade requested` event, check `VITE_COLLAB_WS_URL`, the endpoint hostname/path, and service reachability first.
