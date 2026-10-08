# Sketchizi 1.10.22 — Fix Collaboration Status Runtime

## Root cause

`src/components/app/CollaborationUI.jsx` referenced `creationState` while the existing collaboration state is named `collaborationCreationState` in `useCollaboration()`. The value was already maintained and returned by the hook, but it was not passed into `CollaborationUI`.

## Minimal fix

- Pass the existing `collaborationCreationState` from `App.jsx` into `CollaborationUI`.
- Use that existing state in `CollaborationUI` instead of the undefined `creationState` identifier.
- No new collaboration state machine or arbitrary variable was introduced.

## Preserved behavior

- Non-blocking creating status
- Interactive canvas during creation
- Duplicate creation protection
- Non-blocking failure status
- Retry and dismiss
- Existing Connected · Host UI
- Collaboration server/WebSocket protocol and lifecycle

## Version

`1.10.22`
