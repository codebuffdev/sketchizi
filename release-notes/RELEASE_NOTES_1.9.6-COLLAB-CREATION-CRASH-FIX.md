# Sketchizi 1.9.6 — Collaboration Creation Crash Fix

## Root cause

The 1.9.5 permission/authorship layer introduced two synchronous update paths during collaboration creation:

1. The Viewer-mode synchronization effect called `api.updateScene()` even when `viewModeEnabled` already had the requested value. That generated unnecessary Excalidraw `onChange` cycles.
2. `SketchiziCollaboration.updateLocalAuthorship()` called the React `onAuthorship` callback on every canvas change, even when the authorship metadata had not changed. During the host initialization/update cycle this produced redundant React state updates and could amplify the Excalidraw `onChange` cycle into React's `Maximum update depth exceeded` error.

## Repair

- The view-mode effect now updates Excalidraw only when `viewModeEnabled` actually changes.
- Local authorship now notifies React only when authorship metadata actually changes. Repeated canvas changes by the same participant do not create redundant authorship state updates.
- No timeout, interval, lifecycle flag, StrictMode change, collaboration redesign, or permission removal was introduced.

## Preserved

- HOST / EDITOR / VIEWER permission model
- request / approve / deny / revoke lifecycle
- server-side write enforcement
- participant presence and identity
- canvas synchronization
- authorship metadata
- existing room lifecycle

## Verification

- JavaScript syntax checks: PASS for changed non-JSX modules.
- Authorship idempotence regression test: PASS.
- `npm run build`: blocked in the execution environment because Vite dependencies are not installed and npm registry access is unavailable.
- Browser runtime verification: not completed in this execution environment.
