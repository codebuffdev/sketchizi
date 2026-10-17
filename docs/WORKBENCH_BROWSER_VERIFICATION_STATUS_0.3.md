# Workbench Browser Verification Status 0.3

Date: 2026-10-17
Baseline: Sketchizi 1.10.86

## What was added

A static browser smoke page is available at `tests/browser/workbench-persistence-smoke.html` with its module at `tests/browser/workbench-persistence-smoke.js`. It imports the actual repository modules (`src/persistence.js`, `src/fileSystem.js`, `src/features/workbench/workbenchDocument.js`), writes an example multi-view Workbench document through the real IndexedDB persistence APIs, deliberately reloads the page, then checks the restored active document, recent snapshot, emergency backup, image payload, inactive view, semantic model, and unknown extension data. It also checks the `.sketchizi` serializer/parser round-trip.

## How to run in a local browser

From the project root, start a static server on a separate origin:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open:

`http://127.0.0.1:8765/tests/browser/workbench-persistence-smoke.html`

Wait for `PASS — browser reload persistence test` and ensure all checks on the page read `PASS`.

Port 8765 is deliberately separate from the normal Vite dev server at port 5173. IndexedDB and localStorage are origin-scoped; this avoids replacing the normal app's saved document while testing persistence.

## Results in the current execution environment

- `npm run test:workbench-format`: **14 passed, 0 failed**.
- `npm run test:sync`: **35 passed, 0 failed**.
- Production build: **not verified**. `npm ci` repeatedly failed requests to `registry.npmjs.org` with `EAI_AGAIN`; the required Vite and Excalidraw packages were unavailable in the worktree.
- Automated Chromium smoke page: **not executed**. The installed system Chromium is enterprise-policy blocked from navigating to any URL (`URLBlocklist: ["*"]`), including `http://127.0.0.1:8765/...` and `file://...`. This is an environment restriction, not a passing browser test.

## Scope boundary

The browser page verifies actual browser IndexedDB/localStorage and serializer persistence across a reload; it does **not** yet exercise the complete React/Excalidraw application UI or prove that app startup selects the right layout after reload. That app-level gate remains open until dependencies/build and browser navigation are available.

## Windows runner added in follow-up

Use [`WORKBENCH_BROWSER_VERIFICATION_WINDOWS.md`](./WORKBENCH_BROWSER_VERIFICATION_WINDOWS.md) and run `scripts/verify-workbench-browser.ps1` from the project root. This starts and stops an isolated local server and opens the smoke test automatically. The test still must be run in a user browser; this restricted execution environment cannot navigate Chromium to a local URL.
