# Sketchizi 1.10.28 — Pencil / Freehand Collaboration Performance

## Root cause addressed
- High-frequency FreeDraw updates were entering the full Sketchizi `onChange` path on every intermediate point update.
- Relationship metadata synchronization performed whole-scene scans even though intermediate FreeDraw changes are not connectors.
- Architecture validation ran synchronously for every scene change.
- The collaboration transport could continue calling `WebSocket.send()` while `bufferedAmount` was already high, allowing stale intermediate scene states to accumulate.
- Remote scene updates re-entered the same expensive scene-change path.

## Optimization implemented
- Intermediate local FreeDraw updates skip AWS/Kubernetes relationship metadata scans while Excalidraw reports the active `newElement`. The final pointer-up state is processed normally.
- Remote collaboration updates skip redundant relationship metadata scans because the sender already synchronizes and transmits the effective element state.
- Architecture validation is coalesced to one scheduled callback per animation frame, retaining the newest scene state.

## Transport / backpressure behavior
- Existing `requestAnimationFrame` + `pendingElements` coalescing is preserved.
- Scene updates now inspect `socket.bufferedAmount` before sending.
- Above the collaboration high-water mark, the latest pending element state is retained and a short retry is scheduled instead of deliberately queueing another stale scene update.
- Non-scene collaboration messages continue to use the existing send path.
- Leave/end flows force the latest pending scene update onto the socket before sending their lifecycle message, so an intentional exit does not discard the final pending state.

## Final-stroke guarantee
- Excalidraw's `onPointerUp` subscription is used to immediately attempt a final pending FreeDraw flush.
- Intermediate states may be delayed/coalesced when transport is behind, but the latest state remains pending until it can be sent.
- The final pointer-up scene is not discarded by the coalescing mechanism.

## Remote update optimization
- Remote `api.updateScene()` updates continue to happen normally so the canvas can render the latest collaboration state.
- Redundant relationship metadata scans are avoided on remote scene re-entry.
- Architecture validation is scheduled/coalesced rather than executed synchronously for every intermediate remote update.
- Existing minimap and persistence scheduling behavior is retained.

## Collaboration architecture / protocol
- Node WebSocket server architecture is unchanged.
- Collaboration message structure is unchanged.
- HOST/JOINEE, permissions, presence, sharing, Details, Leave, End Collaboration, and version/versionNonce reconciliation behavior are unchanged.

## Files changed
- `src/collaboration.js`
- `src/features/collaboration/useCollaboration.js`
- `src/features/canvas/useExcalidrawScene.js`
- `package.json`
- `index.html`
- `RELEASE_NOTES_1.10.28-PENCIL-COLLABORATION-PERFORMANCE.md`

## Testing performed
- Source inspection of collaboration send/receive and scene-change paths.
- Node syntax checks for modified JavaScript files.
- Targeted transport/coalescing unit-style test with a mocked WebSocket was executed.
- Live two-browser collaboration performance testing was not available in this environment, so no claim of measured end-to-end latency improvement is made.

## Build result
- `npm install --no-audit --no-fund` was attempted.
- The install did not complete within the environment timeout, leaving Vite unavailable.
- `npm run build` therefore did not succeed because dependencies were unavailable.
