# Workbench Browser Verification Status 0.14

## Added coverage

The isolated browser smoke test now creates a real deterministic Workbench experiment suite, stores a bounded simulation-history entry in the `.sketchizi` extension, reloads the page, and verifies:

- active document and recent snapshot persist through IndexedDB;
- semantic model, inactive view layout, unknown extension data, and image payload survive;
- saved simulation history retains baseline metrics and restores into the results model without rerunning the engine;
- unchanged model/profile leaves history current;
- changing semantic model content or simulation profile marks history stale;
- serialization preserves the history entry.

## Automated checks run in this environment

- Full Node test suite: 249 passed, 0 failed.
- Browser smoke script syntax check: passed.
- The same browser fixture's simulation/history setup was exercised directly under Node: completed baseline, traffic-surge and outage runs; history restoration and stale-model detection passed.

## Not verified here

- The real-browser smoke page was not completed in this environment: headless Chromium did not return even for a minimal data URL, so this is an execution-environment limitation.
- Production build remains blocked before Vite because `npm ci` dependencies are not available and the Excalidraw font assets are missing.
- Full React/Excalidraw app-level save/reload workflow remains unverified.

## Run on Windows

From the extracted `sketchizi-main` directory, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-browser.ps1
```

Wait for `PASS — browser reload and simulation-history test`. A pass requires every individual assertion to show `PASS`; if it fails, copy the full failure output. This isolated origin uses `127.0.0.1:8765` and does not overwrite Sketchizi's normal app origin.
