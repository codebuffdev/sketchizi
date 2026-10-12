# Sketchizi 1.9.5 — Host-Controlled Write Permissions

## Scope
Adds server-authoritative collaboration write permissions without replacing the existing WebSocket collaboration architecture.

## Permission model
- HOST: always editable.
- EDITOR: host-approved editor.
- VIEWER: default joinee state.

## Request lifecycle
- Viewer can request edit access.
- Host receives a request and can Allow or Deny.
- Approved viewers become Editor immediately.
- Denied viewers remain Viewer.
- Host can revoke an Editor back to Viewer.
- Request state uses NONE, PENDING, APPROVED, DENIED.

## Server enforcement
The collaboration server stores permission per participant and rejects canvas updates from viewers. Host-only approval, denial, and revocation are enforced server-side. Permission is retained across an unexpected reconnect and removed on intentional leave.

## Viewer experience
Viewer mode enables Excalidraw view mode while retaining pan/zoom/inspection/presence. Custom Sketchizi mutation actions are guarded as well.

## Authorship
Canvas updates now carry server-derived collaboration authorship metadata. The server tracks `createdBy` and `lastModifiedBy` by element ID and includes accepted metadata with synchronization snapshots/updates. The Properties panel exposes this metadata for the selected object.

## Unchanged
Room URLs, host termination, joinee leave, participant identity/colors, presence, cursors, selection awareness, responsive layout, Excalidraw integration, and the existing incremental synchronization strategy remain intact.

## Verification
JavaScript syntax checks were run for the changed non-JSX modules. Full Vite build/browser runtime verification requires installed npm dependencies; this execution environment has no `node_modules` and cannot reach the npm registry.
