# Sketchizi 1.8.2 — Collaboration Session Lifecycle

- Added host/joinee roles to collaboration sessions.
- Host action: **Disconnect**. Terminates the collaboration room and notifies remaining participants.
- Joinee action: **Leave**. Removes only that participant while keeping the room active.
- Terminated collaboration URLs are rejected by the collaboration server.
- Local canvas state is preserved; Disconnect/Leave never triggers a file save.
- Unexpected host WebSocket closure terminates the room and notifies remaining participants.
- Existing live scene synchronization remains unchanged.
