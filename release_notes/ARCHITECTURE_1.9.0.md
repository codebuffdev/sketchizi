# Sketchizi 1.9.0 Architecture Map

## 1. Old architecture

### `src/App.jsx` — 3,092 lines

The previous App component combined:

- application state and persistence state
- panel state and keyboard shortcuts
- Excalidraw API lifecycle and `onChange`
- collaboration connection/state/synchronization wiring
- filesystem open/save/folder/recent-file operations
- Eraser catalog loading/caching
- icon search/favorites/recently-used state
- editable UML/mind-map construction
- icon insertion and pointer/mouse drag/drop
- minimap scene calculation/navigation
- alignment/distribution/grid/connector operations
- native Excalidraw menu DOM integration
- More Tools positioning and tool activation
- collaboration modal/status rendering
- canvas rendering

### `src/styles.css` — 4,580 lines

The previous stylesheet combined:

- base shell
- icon library
- layout toolbar
- Properties
- minimap
- theme styling
- Eraser styling
- native menu styling
- historical responsive revisions
- collaboration responsive layout

## 2. New architecture

```text
src/
├── App.jsx                                  # composition/wiring
├── components/app/
│   ├── SketchiziCanvas.jsx                  # Excalidraw + minimap surface
│   ├── CollaborationUI.jsx                  # collaboration dialog/status UI
│   └── MoreTools.jsx                        # More Tools UI
├── features/
│   ├── canvas/
│   │   ├── useExcalidrawScene.js             # Excalidraw onChange boundary
│   │   └── useMinimapController.js            # minimap scene/navigation
│   ├── collaboration/
│   │   └── useCollaboration.js                # collaboration React state/wiring
│   ├── files/
│   │   ├── useFileManager.js                  # filesystem workflow
│   │   └── useRecentFiles.js                  # recent file/folder state
│   ├── icon-library/
│   │   ├── useIconCatalog.js                  # catalog/search/favorites/cache
│   │   ├── useIconInsertion.js                # pointer/mouse/drag interaction
│   │   └── iconInsertionService.js            # editable icon construction/insertion
│   ├── layout/
│   │   └── useCanvasTools.js                  # grid/alignment/selection styling tools
│   ├── navigation/
│   │   ├── useMoreTools.js                    # More Tools integration
│   │   ├── useNativeSketchiziMenu.js          # native menu customization
│   │   ├── usePanelState.js                    # mutually-exclusive panel state
│   │   └── useSketchiziPreferences.js         # theme/preferences/shortcuts/reset
│   └── persistence/
│       └── useSketchPersistence.js            # IndexedDB/emergency-save workflow
└── styles/
    ├── base.css
    ├── library.css
    ├── layout.css
    ├── properties.css
    ├── icon-library.css
    ├── minimap.css
    ├── theme.css
    ├── eraser.css
    ├── shell.css
    └── responsive*.css
```

## 3. Migration map

| Old responsibility | New owner |
|---|---|
| App persistence/restore/save queue | `features/persistence/useSketchPersistence.js` |
| Collaboration state/connect/end/leave | `features/collaboration/useCollaboration.js` |
| File/folder open/save workflows | `features/files/useFileManager.js` |
| Recent files/folders | `features/files/useRecentFiles.js` |
| Eraser catalog/search/favorites/cache | `features/icon-library/useIconCatalog.js` |
| Icon pointer/mouse/HTML5 drag | `features/icon-library/useIconInsertion.js` |
| Editable UML/mind-map/Eraser insertion construction | `features/icon-library/iconInsertionService.js` |
| Minimap scene projection/navigation | `features/canvas/useMinimapController.js` |
| Excalidraw `onChange` synchronization boundary | `features/canvas/useExcalidrawScene.js` |
| Grid/alignment/connector tools | `features/layout/useCanvasTools.js` |
| Panel exclusivity | `features/navigation/usePanelState.js` |
| More Tools DOM integration | `features/navigation/useMoreTools.js` |
| Native Excalidraw menu customization | `features/navigation/useNativeSketchiziMenu.js` |
| Theme/preferences/shortcuts/reset | `features/navigation/useSketchiziPreferences.js` |
| Collaboration UI | `components/app/CollaborationUI.jsx` |
| More Tools UI | `components/app/MoreTools.jsx` |
| Excalidraw/minimap UI | `components/app/SketchiziCanvas.jsx` |
| Global stylesheet | ordered files under `src/styles/` |

## 4. File-size report

Files originally above 500 lines:

| File | Old | New |
|---|---:|---:|
| `src/App.jsx` | 3,092 | 269 |
| `src/styles.css` | 4,580 | 10 (import manifest) |

The stylesheet content itself was not rewritten: the 10-line manifest plus imported files reassemble to the exact original 4,580-line CSS content.

The largest new feature implementation files remain below 500 lines except no new source file exceeds 500 lines. `useFileManager.js` is 479 lines and `iconInsertionService.js` is 476 lines.

## 5. Largest source files after refactoring

1. `src/styles/responsive-features.css` — 480
2. `src/features/files/useFileManager.js` — 479
3. `src/features/icon-library/iconInsertionService.js` — 476
4. `src/persistence.js` — 459
5. `src/styles/base.css` — 367
6. `src/fileSystem.js` — 344
7. `src/styles/responsive-theme.css` — 317
8. `src/collaboration.js` — 310
9. `src/styles/responsive-touch.css` — 234
10. `src/styles/layout.css` — 240

## 6. Behavior preservation

The collaboration client/server modules were left unchanged by the refactor. The existing collaboration protocol and realtime synchronization semantics remain in place.

The CSS split is an exact reassembly of the 1.8.6 stylesheet, preserving cascade order and selector content.

## 7. Verification

Passed:

- JavaScript syntax checks for all extracted `.js` modules
- JSX/JS syntactic parsing with the installed TypeScript parser
- local relative-import existence check
- unresolved-identifier sanity check
- exact CSS reassembly comparison against the 1.8.6 stylesheet
- collaboration client/server source unchanged comparison
- Eraser library source unchanged comparison

Not completed:

- `npm run build` — `vite` is not installed because dependency installation timed out
- browser runtime/manual feature testing

The runtime limitations are explicitly documented rather than treated as successful tests.
