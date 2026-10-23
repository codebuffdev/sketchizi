# Sketchizi 1.10.23 — Host Details Fix

## Root cause

After a host successfully created a collaboration, `collaborationMode` remained `"create"`. The existing Details button only opened the dialog, so `CollaborationUI` continued to render the create-dialog branch. Because creation had already reached success, the create form itself was suppressed, leaving the host with an essentially empty `Create collaboration` dialog.

## Fix

The existing Details action now goes through a small handler in `App.jsx`. When the existing authoritative collaboration state indicates an active collaboration (`collaborationRoom`, `collaborationRole`, and a non-disconnected `collaborationStatus`), it switches the existing `collaborationMode` to `"active"` and opens the dialog. If no active collaboration exists, it preserves the previous open behavior.

No duplicate collaboration state, persistence, URL mechanism, room state, or collaboration engine was introduced.

## Preserved

- Host creation flow
- Joinee join flow
- Existing active collaboration details UI
- HOST/JOINEE roles and permissions
- WebSocket/server/protocol
- Sharing, leaving, ending, participant handling
- Non-blocking collaboration creation UX
- All unrelated Sketchizi features
