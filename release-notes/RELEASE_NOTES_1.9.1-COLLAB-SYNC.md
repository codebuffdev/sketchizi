# Sketchizi 1.9.1 — Collaboration Synchronization Quality

## Scope

Synchronization-only stabilization. No collaboration protocol, room lifecycle, UI, responsive layout, or Excalidraw behavior redesign.

## Changes

- Local Excalidraw changes remain immediate; the network is not placed in the local drawing path.
- Local collaboration updates are coalesced to at most one update per animation frame.
- The latest element state wins within a frame.
- A newly created element that is created and deleted before its first outbound frame is not sent remotely.
- A deletion of an element that was already synchronized remains a real outbound deletion.
- Existing incremental element synchronization is preserved; full-scene updates are not introduced.
- Server-side room state now filters stale/duplicate element updates before broadcasting them.
- Element version remains authoritative, with versionNonce as the existing deterministic tie-breaker for concurrent equal-version edits.
- Existing remote reconciliation through Excalidraw `reconcileElements()` is preserved.
- Pending local changes are preserved across remote baseline reconciliation when their latest local version still differs.

## Intentionally unchanged

- WebSocket URL/protocol shape
- room creation and IDs
- host/joinee lifecycle
- participant count
- host termination / joinee leave
- collaboration UI
- responsive layout
- toolbar, Properties, Icon Library, Eraser catalog
