# Sketchizi 1.10.21 — Collaboration Non-Blocking Status

## Scope

The existing collaboration creation lifecycle is unchanged. This release changes only the presentation of the asynchronous creation status.

## Changes

- Removed the blocking collaboration creation state from the collaboration modal.
- Added a compact non-blocking `Creating collaboration…` status in the existing desktop application header.
- The canvas and normal Sketchizi controls remain interactive while collaboration creation is in progress.
- The Start Collaboration action is disabled while the existing creation attempt is active.
- Added a compact non-blocking failure status with `Try again` and dismiss controls.
- Retry reuses the existing `createCollaboration()` flow.
- Dismissing the failure indication does not end an existing collaboration.
- Existing connected collaboration UI remains unchanged.
- Collaboration server, WebSocket protocol, room creation, HOST/JOINEE logic, joining, presence, sharing, and lifecycle behavior are unchanged.
- Removed the obsolete modal-specific creating/failure presentation CSS and JSX.

## Version

`1.10.21`
