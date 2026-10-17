# Engineering Workbench File-Format Prototype 0.1

**Status:** isolated prototype; not connected to the Sketchizi UI or live save workflow.  
**Baseline:** Sketchizi 1.10.86.  
**Namespace:** `extensions["com.sketchizi.workbench"]`.

## Goal

Prove that one `.sketchizi` file can hold a single shared semantic model and several independent view layouts, while retaining the existing Excalidraw-compatible active scene and unrelated extension data. This prototype does not change `.excalidraw` serialization and does not migrate or rewrite user documents.

## Storage decision under test

- `diagram` continues to store the active Excalidraw scene. Existing Sketchizi/Excalidraw reading stays centered on that field.
- `extensions["com.sketchizi.workbench"]` stores one copy of semantic entities and relationships, view metadata, model revision, and **inactive** view scenes.
- A view scene's elements are visual placements, not copies of semantic entities. A semantic placement can refer to its entity using `element.customData.sketchizi.workbenchEntityId`.
- `viewScenes` must never contain the active view. This avoids storing the active scene twice.
- When switching views, the outgoing active scene moves into `viewScenes`; the incoming scene is promoted to `diagram` and removed from `viewScenes`.
- Other keys in the top-level `extensions` object are preserved when Workbench data is updated.
- Ordinary shapes, text, icons, and arrows remain ordinary Excalidraw elements unless an explicit Workbench action creates or converts them into semantic entities.

## Proposed extension shape

```json
{
  "schemaVersion": 1,
  "modelRevision": 7,
  "activeViewId": "system",
  "entities": [
    { "id": "api-1", "kind": "backend.rest-service", "name": "API", "properties": { "port": 8080 } }
  ],
  "relations": [
    { "id": "ui-calls-api", "kind": "calls", "sourceId": "frontend-1", "targetId": "api-1" }
  ],
  "views": [
    { "id": "system", "kind": "system", "title": "System" },
    { "id": "apis", "kind": "apis", "title": "APIs" }
  ],
  "viewScenes": {
    "apis": { "elements": [], "appState": {}, "files": {} }
  }
}
```

This is extension content only, not a complete file. The complete `.sketchizi` envelope remains `type: "sketchizi"`, `formatVersion: 1`, `diagram`, `metadata`, and `extensions`.

## Prototype implementation

- `src/features/workbench/workbenchDocument.js` is a UI-independent experiment.
- `createWorkbenchExtension()` validates core invariants: unique view/entity/relation IDs, an existing active view, valid relation endpoints, known layout IDs, and no active-scene duplication.
- `withWorkbenchExtension()` writes the extension while preserving other extension namespaces.
- `readWorkbenchDocument()` reads existing `parseDrawing()` output without affecting ordinary drawings.
- `activateWorkbenchView()` swaps the current scene and a saved inactive scene without duplicating semantic entities.
- `tests/workbench-document-prototype.test.js` exercises format round-tripping, view switching, dangling-reference rejection, plain-file behavior, and preservation of unrelated extension fields.

## Results so far

The existing `tests/sketchizi-format.test.js` passes (5 tests). The prototype suite passes (4 tests). Together, **9/9 targeted tests pass** using Node's built-in test runner without installing third-party packages.

## Important limitations

1. The production application is not yet wired to these helpers; there is no UI or real autosave integration in this prototype.
2. The baseline production build has **not** been verified in this run. `npm ci` could not resolve `registry.npmjs.org` (`EAI_AGAIN`), so the dependency installation did not complete.
3. **Confirmed persistence gap:** IndexedDB autosave (`saveSketch`) only stores `elements`, `appState`, and `files`. Recent-file persistence (`saveRecentSketch`) also omits `metadata` and `extensions`, even though some callers pass them. The Workbench extension would therefore be lost on browser reload or snapshot reopen unless these persistence paths and recovery handling are updated as part of integration. File-handle saves already serialize the top-level extensions through `currentSceneText()`; each persistence pathway needs its own round-trip test.
4. `formatVersion` remains 1 and Workbench has its own `schemaVersion` 1. Any eventual migration policy must be explicit and must preserve unknown extension fields wherever possible.
5. Images/files for inactive view scenes are carried in that scene's `files` object in this prototype. A production implementation should review deduplication and orphan-file cleanup before saving large multi-view files.

## Gate before UI implementation

Do not start the visible Workbench UI until we have:

- a successful production build of the untouched baseline in an environment with dependencies available;
- a decision on migration/recovery behavior when a file is opened by an older Sketchizi build;
- tests for open-edit-save-reopen and active/inactive view swaps through the real file manager;
- an explicit rule for whether deleting a semantic entity removes it from all views (recommended) while deleting one placement removes only that view placement.

## Persistence iteration 0.1

The persistence integration was added to the isolated prototype worktree:

- `src/persistence.js` stores `metadata`, `extensions`, and `format` in local and recent records, while defaulting legacy records to the prior-compatible empty values.
- `src/features/persistence/useSketchPersistence.js` enriches autosave/retry/emergency payloads with the current document-level metadata and restores the metadata reference from local/emergency records.
- `src/features/files/useFileManager.js` carries document extensions through file opens, recent snapshots, file saves, and recovery downloads.
- `tests/workbench-persistence-lifecycle.test.js` exercises the actual IndexedDB save/load API functions against a deterministic in-memory IndexedDB test double, then serializes and parses the restored document.

Current focused result: 15/15 tests across format, Workbench model/view switching, persistence record builders, actual persistence API round-trips, and recovered drafts pass. Collaboration sync suite: 35/35 pass. These are automated Node tests, not a real browser reload test. The full Vite production build remains unverified because the packaged `node_modules` contains empty placeholder package directories for Vite and Excalidraw; npm dependency installation previously failed during DNS resolution. Do not infer production readiness from the passing unit tests alone.
