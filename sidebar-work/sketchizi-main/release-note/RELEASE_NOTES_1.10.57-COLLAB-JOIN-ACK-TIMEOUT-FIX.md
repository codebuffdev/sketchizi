# Sketchizi 1.10.57 — Collaboration Join Acknowledgement Timeout Fix

## Root cause from production logs

Render logs showed the WebSocket upgrade was accepted, but the server did not receive the initial `join` message until 17–21 seconds later. It then created the room and registered the host, followed almost immediately by an abnormal client disconnect. The client had a single 15-second creation timer starting before the initial join payload had been sent/received, so it could close a valid session while a large initial snapshot was still being prepared or uploaded. The UI error incorrectly described this as a WebSocket handshake failure.

## Changes

- Keep the 15-second deadline for the initial connection/join-message preparation phase, but report whether the socket had opened.
- Start a separate 60-second server-join acknowledgement deadline only after the initial join payload has been serialized and handed to the browser WebSocket.
- Clear the acknowledgement deadline when the server sends the `joined` acknowledgement or when a server error is handled.
- Log initial snapshot element/file counts, snapshot preparation duration, join payload character count, serialization duration, and elapsed time until the join payload is queued. No payload contents or authorization token values are logged.
- Add regression assertions for the timeout phase ordering.

## Verification

Automated tests cover the new phase-specific timeout lifecycle. A successful live collaboration session must still be confirmed after deployment.
