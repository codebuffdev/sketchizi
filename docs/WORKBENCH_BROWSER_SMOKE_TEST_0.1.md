# Workbench Browser Smoke Test 0.1

This smoke test exercises the actual persistence and file-format modules in a real browser origin and deliberately reloads the page between write and read phases. It does not launch the full Excalidraw app; the UI integration/reload workflow remains a separate gate.

## Run locally

1. Use a working copy of this ZIP and ensure Python 3 is installed.
2. From the `sketchizi-main` project root, run:

   ```bash
   python -m http.server 8765 --bind 127.0.0.1
   ```

3. Open `http://127.0.0.1:8765/tests/browser/workbench-persistence-smoke.html` in Chrome/Chromium.
4. Wait for `PASS — browser reload and simulation-history test`.
5. Check the result list on the page. The second page load is intentional; it verifies storage across a document reload.

The static server is on port 8765, a separate origin from the usual Vite dev server on port 5173, so the test uses an isolated IndexedDB/localStorage namespace and will not overwrite the normal app's local autosave.

## Coverage

- Active `.sketchizi` document stored and restored through the real IndexedDB API across reload.
- Workbench semantic entities, relations, active view, inactive view scene, and model revision.
- Unknown namespaced extension preservation.
- Referenced image-file payload retention in IndexedDB and file serialization.
- Recent-file snapshot stored/restored across reload.
- Emergency localStorage backup preservation.
- `serializeDrawing`/`parseDrawing` round-trip.
- Completed synthetic simulation history retained in the saved document and restored without rerunning the engine.
- Restored history is current when model/profile match and marked stale after a semantic model or simulation-profile change.

## Limits

This is a persistence-module browser test, not an end-to-end test of the full Sketchizi React/Excalidraw UI. It does not establish that UI state restoration switches the canvas to the right view after reload. That still needs an app-level browser pass after the production dependencies can be installed and the application can be built.
