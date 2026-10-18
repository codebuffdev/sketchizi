# Sketchizi Engineering Workbench — Browser Verification Harness 0.14

## Purpose

This iteration strengthens the local verification gate after simulation history was added in prototype 0.13. It does not add a new product feature or claim the full app is browser-verified. It extends the isolated browser smoke page to cover the persisted simulation history and stale-result rules.

## Added browser assertions

The test creates a small React → REST service → PostgreSQL model, runs the deterministic baseline / traffic-surge / outage suite, stores a simulation-history entry with the Workbench extension, and then deliberately reloads the page. After reload it verifies:

- active `.sketchizi` record and metadata survive IndexedDB persistence;
- semantic entities and inactive view layout survive;
- unknown extension data and referenced image payload survive;
- recent-file snapshot and emergency backup retain the extension;
- simulation history and baseline metrics survive and restore without rerunning the engine;
- matching model/profile inputs do not mark the saved result stale;
- a semantic model change or simulation-profile change marks the saved result stale;
- file serialization preserves the saved history.

## Checks completed

- Full Node test suite: **249 passed, 0 failed**.
- Updated browser smoke JavaScript syntax check: **passed**.
- Direct execution of the same model/profile/history fixture under Node: **completed**; baseline, traffic surge and outage scenarios were created, history restored, and semantic-model stale detection passed.
- ZIP integrity check: **passed**.

## Checks still blocked

- The real-browser smoke page did not complete in this environment. Headless Chromium failed to return even for a minimal data URL, so browser behavior is not marked passed.
- The production build remains blocked before Vite because npm dependencies / Excalidraw font assets are not available in the worktree.
- This remains a persistence-module smoke test, not a complete React/Excalidraw UI test. It does not verify canvas view restoration in the full app.

## How to run on Windows

Extract the ZIP, open PowerShell in the `sketchizi-main` directory, and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-browser.ps1
```

Wait for `PASS — browser reload and simulation-history test`. Every individual assertion must show `PASS`. If it fails, copy the complete failure output. The test origin is `http://127.0.0.1:8765`, isolated from the normal Sketchizi origin.

## Roadmap status

OpenAPI and SQL generation remain paused. Resume only after the end-to-end simulation workflow is reproducible, measurable, explainable, and verified in the running application. The original stable 1.10.86 ZIP remains untouched.

## Suggested Git commit

`test(workbench): verify simulation history across browser reload`
