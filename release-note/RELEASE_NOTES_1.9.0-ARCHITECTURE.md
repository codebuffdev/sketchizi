# Sketchizi 1.9.0 — Architecture Refactor

## Purpose

1.9.0 is an architecture/maintainability release. It does not add product features or intentionally redesign existing UI behavior.

## Before

The primary React application file had 3,092 lines and mixed:

- application state
- Excalidraw integration
- collaboration lifecycle and synchronization wiring
- filesystem operations
- persistence
- icon catalog/favorites/search
- icon insertion and drag/drop
- minimap logic
- layout/grid operations
- native-menu DOM integration
- keyboard shortcuts
- UI rendering

`styles.css` was also a single 4,580-line stylesheet containing feature styling and many historical responsive/theme sections.

## After

`App.jsx` is reduced to a composition layer. Major responsibilities now have explicit feature modules:

- `features/collaboration/useCollaboration.js`
- `features/persistence/useSketchPersistence.js`
- `features/files/useFileManager.js`
- `features/files/useRecentFiles.js`
- `features/icon-library/useIconCatalog.js`
- `features/icon-library/useIconInsertion.js`
- `features/icon-library/iconInsertionService.js`
- `features/canvas/useExcalidrawScene.js`
- `features/canvas/useMinimapController.js`
- `features/layout/useCanvasTools.js`
- `features/navigation/usePanelState.js`
- `features/navigation/useMoreTools.js`
- `features/navigation/useNativeSketchiziMenu.js`
- `features/navigation/useSketchiziPreferences.js`

UI-only boundaries were also extracted into:

- `components/app/SketchiziCanvas.jsx`
- `components/app/CollaborationUI.jsx`
- `components/app/MoreTools.jsx`

The global stylesheet was split into ordered feature/style modules without changing selector content or cascade order.

## Collaboration preservation

The WebSocket protocol, room identifiers, host/joinee behavior, participant count, termination/leave semantics, and realtime scene synchronization semantics were not redesigned.

The existing path remains conceptually:

`Excalidraw onChange -> collaboration broadcast -> WebSocket server -> remote client -> reconcile/updateScene`

## Excalidraw boundary

Excalidraw-specific scene change handling is now isolated in `useExcalidrawScene.js`, while the rendered editor/minimap surface is isolated in `SketchiziCanvas.jsx`.

## Icon-library boundary

Catalog/favorites/search/cache behavior is in `useIconCatalog.js`. Pointer/mouse drag behavior is in `useIconInsertion.js`. Editable UML/mind-map and Eraser insertion construction is in `iconInsertionService.js`.

## CSS

The original stylesheet is now an ordered import manifest. Feature-specific CSS and responsive sections are physically separated while preserving the previous cascade order.

## Verification

- JavaScript syntax checks: passed.
- JSX syntax parsing with the installed TypeScript parser: passed.
- Local relative import existence check: passed.
- Identifier sanity check: passed.
- Browser/runtime verification: **not completed** because npm dependency installation timed out in the current environment.
- `npm run build`: **not completed** for the same dependency/network limitation.

No runtime behavior should be considered newly verified solely from this refactor.
