# Sketchizi Engineering Workbench — Persistence Prototype 0.2

**Baseline:** Sketchizi 1.10.86  
**Scope:** Workbench document metadata persistence and deterministic API-level round-trip verification  
**Status:** Isolated prototype; not production-ready and not yet browser-verified

## What changed in this iteration

- Added `tests/workbench-persistence-lifecycle.test.js`, which calls the real `saveSketch`/`loadSketch` and `saveRecentSketch`/`loadRecentSketch` functions against a deterministic in-memory IndexedDB test double.
- Verified autosave records preserve `.sketchizi` format, document metadata, Workbench semantic data, inactive view scene layouts, file payloads, and an unrelated extension namespace after save/load and serialize/parse.
- Verified recent-file snapshots preserve Workbench metadata and inactive layouts.
- Added the lifecycle suite to `npm run test:workbench-format`.
- Extended the file-format prototype documentation with the persistence integration and verification boundaries.
- Packaged source without `node_modules`; dependency directories in the worktree were empty placeholders and are not useful or portable.

## Test results

| Suite | Result |
|---|---:|
| Sketchizi format + Workbench format/model/persistence API tests | 15/15 passed |
| Recovered-draft regression test | 1/1 passed |
| Collaboration sync suites | 35/35 passed |

The persistence lifecycle tests exercise the application persistence functions, but use an in-memory test double. **They do not prove a real browser IndexedDB implementation, browser reload, or full UI file lifecycle.**

## Build status / blocker

`npm run build` was attempted. It stops in the `prebuild` script because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is missing. Inspection showed empty placeholder package directories for Vite and Excalidraw, rather than installed dependencies. Earlier dependency installation failed at DNS resolution. Therefore a production build and browser smoke test remain unverified.

## Scope boundary

No visible Workbench UI was added. No architecture diagramming behavior was intentionally changed. The original uploaded stable baseline ZIP remains untouched. `.excalidraw` serialization stays in its standard shape; the Workbench model remains namespaced under `extensions["com.sketchizi.workbench"]` in `.sketchizi` files.

## Next verification gate

1. Install dependencies in a working network/package-cache environment (`npm ci`).
2. Run `npm run build`.
3. In a real browser, open a `.sketchizi`, create/switch multiple Workbench views, autosave, reload, reopen a recent snapshot, and verify the active and inactive scene layouts plus semantic model.
4. Check legacy `.sketchizi` and ordinary `.excalidraw` files before beginning the visible Workbench shell.
