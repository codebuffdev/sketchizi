# Sketchizi 1.9.7 — Undo / Redo Integration

## History model

Sketchizi does not introduce a second application-level history stack. It uses Excalidraw 0.18.x built-in history and `CaptureUpdateAction` semantics. Excalidraw 0.18 introduced multiplayer-aware undo/redo.

### Local editing

Existing local element mutations already use `CaptureUpdateAction.IMMEDIATELY`, including:

- native Excalidraw drawing/shapes/text/move/resize/delete
- Sketchizi layout operations
- Properties-panel element changes
- connector changes
- Icon Library/UML/Mind Map/Eraser insertion

These become local Excalidraw history entries. Continuous freehand drawing remains under Excalidraw's native gesture/history handling rather than creating a Sketchizi entry per pointer event.

### Remote collaboration

Remote scene application already uses `CaptureUpdateAction.NEVER` and the explicit `collaborationRemoteUpdateRef` origin marker. Remote updates therefore do not enter the local undo/redo history and are not rebroadcast as local edits.

This is the intended Excalidraw 0.18 multiplayer history integration; no global room-wide undo stack was added.

### History boundaries

Loading a drawing, creating a new drawing, and the existing “clear canvas” operation are scene-boundary operations rather than local editing actions. They now use `CaptureUpdateAction.NEVER` and clear Excalidraw's built-in history so Undo cannot unexpectedly restore a previous document.

## Collaboration semantics

Each browser keeps its own Excalidraw undo/redo history. A local undo produces a normal local scene mutation which is synchronized through the existing collaboration update path. It is not an `UNDO` command and does not ask the room to undo another participant's history.

Excalidraw 0.18's history implementation is specifically designed around multiplayer undo/redo and applies history deltas against the current scene rather than replacing the entire room snapshot.

## Scope

No custom history engine, collaboration protocol redesign, UI redesign, or responsive changes were introduced in this milestone.
