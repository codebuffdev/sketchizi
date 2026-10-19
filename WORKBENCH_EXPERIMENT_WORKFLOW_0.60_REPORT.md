# Sketchizi Workbench 0.60 — Experiment Workflow Verification

## Purpose

Extend the existing browser persistence smoke workflow to cover the full saved-experiment lifecycle using the real simulation runner and history/comparison modules.

## Changes

- The browser smoke fixture executes the same simulation inputs twice through `runWorkbenchExperiments`.
- The original run and replay are stored as separate history entries; the replay cannot overwrite the original evidence.
- Browser reload assertions verify that both history entries, their metrics, and replay label survive IndexedDB persistence.
- The workflow assesses reproducibility and compares matching scenario metrics after reload.
- Comparable metrics must have zero deltas for an unchanged deterministic replay; unavailable metrics remain null rather than being fabricated as zero.
- Existing checks still cover stale-result detection after model/profile changes, `.sketchizi` serialization, and retained artifact/index evidence.
- Added Node integration tests for serialization round-trip, deterministic replay, history comparison, stale-result behavior, and smoke-workflow coverage.
- Added `test:workbench-browser-workflow` for the workflow and local verification-server tests.

## Verification

- `npm run test:simulation`: **162 passed, 0 failed**.
- `npm run test:browser-verification-server`: **6 passed, 0 failed**.
- `node --check tests/browser/workbench-persistence-smoke.js`: passed.
- `node --check tests/workbench-experiment-workflow.test.js`: passed.
- ZIP integrity: checked after packaging.

## Not run

- The actual Chromium browser workflow (`npm run test:workbench-browser-e2e`) was **not run**. The extracted environment has no `node_modules` and Playwright is not present in the package lock, so this archive does not claim a real-browser pass.
- Production Vite build and the full release gate were not run.

## Interpretation boundary

Node integration tests execute the real simulation runner and history/comparison functions, and the browser smoke page now contains the additional persistence/replay assertions. This is not proof that the page completed those assertions in Chromium; that remains the next verification step after the browser runner dependency is available.
