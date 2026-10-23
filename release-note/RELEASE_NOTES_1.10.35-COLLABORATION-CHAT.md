# Sketchizi 1.10.35 — Collaboration Chat

## Scope
Adds session-scoped chat to the existing collaboration WebSocket connection. Existing scene synchronization, room creation/joining, presence, permissions, sharing, and deployment architecture are preserved.

## Features
- Chat entry point appears in the existing collaboration status bar while a session is active; panel is closed by default.
- Everyone messages are delivered only to clients in the same room, including the sender for consistent local history.
- Host-only messages are delivered server-side only to the sender and host. Hosts can reply privately by selecting a connected participant.
- Server derives sender ID/name and host identity from joined room state, validates audience and recipient, limits messages to 4,000 characters, rate-limits sends to 8 per 10 seconds per participant, and keeps the latest 500 messages in room memory.
- Authorized chat history is sent during join/reconnect. Late join history is not counted as unread. Chat state is cleared on session end/leave in the client and when the room is destroyed on the server.
- Chat history is not added to Excalidraw scene data, diagram persistence, browser storage, or exports.
- The UI supports multiline messages, Enter to send, Shift+Enter for a newline, light/dark styling, unread badges (9+), and a new-message indicator when scrolled away from the bottom.

## Files changed
- `server/collaboration-server.mjs`
- `src/collaboration.js`
- `src/features/collaboration/useCollaboration.js`
- `src/components/app/CollaborationUI.jsx`
- `src/styles/responsive-collaboration.css`
- `src/chatProtocol.js` (new)
- `tests/chat-protocol.test.js` (new)
- `package.json`
- `index.html`
- this release note

## Validation
Run `npm run test:chat`, `npm run test:networking`, and `npm run test:catalog`. Run `npm run build` after dependencies are installed. Browser-level multi-client privacy and unread behavior still require runtime testing.
