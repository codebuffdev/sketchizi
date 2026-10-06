# Sketchizi 1.9.4 — Collaboration Identity / Presence Fix

## Focus

Stabilization of the existing 1.9.3 collaboration presence implementation.

## Fixed

- Joining through a collaboration link now passes the entered participant name into the collaboration client and persists it before the WebSocket join.
- Remote participants therefore retain their real display names instead of falling back to `Guest`.
- Existing participant initials and “who made what” identity labels now use the propagated display name.
- Participant details are rendered through a portal attached to `document.body`, avoiding clipping from collaboration panels and other overflow containers.
- Popover placement is calculated from the avatar anchor and clamped to the viewport on all four edges.
- The popover flips above the avatar when there is insufficient space below it.
- Popover position is recalculated on viewport resize and scroll.
- Escape/outside click closes the popover safely.

## Preserved

- Collaboration room lifecycle
- Host / joinee permissions
- Participant count
- WebSocket protocol
- Canvas synchronization
- Remote cursor/selection/activity behavior
- Existing responsive layout
- Existing collaboration UI styling

## Verification

Static source checks are performed where dependencies are available. Full Vite/browser verification remains dependent on an environment with the project npm dependencies installed.
