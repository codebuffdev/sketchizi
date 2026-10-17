# Engineering Workbench — Persistence Prototype 0.1

**Base:** Sketchizi 1.10.86 plus Workbench file-format prototype 0.1  
**Status:** Persistence-path prototype; no Workbench UI or production release  
**Purpose:** Ensure semantic Workbench state is not lost when the active drawing is autosaved, recovered, reopened from Recent files, or downloaded as a recovery backup.

## Changes

- Added a shared document-metadata reference for `{ metadata, extensions, format }` so file loading and local persistence use the same document-level state.
- Local IndexedDB autosave now stores `metadata`, `extensions`, and `format` with elements, binary files, and the existing saved app-state subset.
- The emergency browser backup uses the enriched payload, including Workbench and third-party extensions, even when a call site supplies only the canvas scene.
- Retry-save carries the current document-level state.
- Recent-file snapshots preserve document metadata, extensions, format, elements, and binary files. Older records without the new fields remain readable through empty/default values.
- Recovery download produces a `.sketchizi` envelope when the document contains Workbench data; ordinary documents continue to use the standard `.excalidraw` shape.
- Added unit tests for payload enrichment, record builders, extension copying, recent snapshots, legacy defaults, and format compatibility.

## Persistence shape

The local active-document record now includes:

```json
{
  "id": "main",
  "format": "sketchizi",
  "metadata": { "title": "Full Stack SaaS" },
  "extensions": {
    "com.sketchizi.workbench": {
      "schemaVersion": 1,
      "activeViewId": "system",
      "entities": [],
      "relations": [],
      "views": [],
      "viewScenes": {}
    }
  },
  "elements": [],
  "files": {},
  "appState": {}
}
```

This is an abbreviated shape illustration. The real Workbench extension must pass `workbenchDocument.js` validation; the active layout stays in the normal active scene, and inactive layouts remain under `viewScenes`.

## Test results

| Command | Result |
|---|---:|
| `npm run test:workbench-format` | 12 passed |
| `npm run test:file-format` | 5 passed |
| `npm run test:recovery` | 1 passed |
| `npm run test:sync` | 35 passed |

The collaboration creation test `initial join acknowledgement timeout starts after the payload is queued` fails in this worktree and reproduced in the previous prototype worktree. Its collaboration source and test are unchanged by this iteration. Running the full test glob without the project's special sync loader also causes the sync-characterization test to fail at process startup; use `npm run test:sync` for that group.

## Build limitation

`npm run build` could not reach Vite compilation: the `prebuild` font-copy script stops because the installed `node_modules` tree lacks `@excalidraw/excalidraw/dist/prod/fonts` and even the Excalidraw package manifest. Dependency installation is incomplete in this environment. Therefore, **a production build and browser-level open/save/reload smoke test are not yet verified**.

## Manual verification required before UI work

1. Open a normal `.excalidraw` file, save, reload, and confirm the drawing still opens unchanged.
2. Open a normal `.sketchizi` file with metadata and unrelated extensions, save, reload, and compare its envelope.
3. Create a Workbench document with at least two views, make edits in each, reload, switch views, and confirm layouts/entity IDs/relations/annotations persist.
4. Trigger emergency recovery and verify that the downloaded `.sketchizi` preserves every view and extension.
5. Reopen a snapshot from Recent files and verify the same state.

## Safety boundaries

- The original stable ZIP is not modified.
- This ZIP is a prototype based on the existing Workbench format prototype, not a deployable release.
- No visible UI or simulation behavior is added in this iteration.
