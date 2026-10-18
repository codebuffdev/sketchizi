# Simulation History Persistence 0.13

## Purpose

Persist a bounded history of synthetic experiment suites in the existing `com.sketchizi.workbench` document extension, so saved `.sketchizi` files can reopen prior results without rerunning the engine.

## Behavior

- Stores up to five most recent completed or partial experiment suites per Workbench document.
- Each entry records timestamp, model revision/fingerprint, simulation profile fingerprint, runner/adapter/engine versions, diagnostics, scenario overrides, per-run metrics, per-node/per-edge evidence, bottlenecks, explanations and a compact snapshot of the profile values used.
- Opening a history entry restores the saved results in the UI without invoking the engine.
- Historical results are marked as saved synthetic outputs. If the current model revision differs, the existing stale-model warning is shown.
- A historical assumptions panel displays recorded parameter values and clarifies they are not live telemetry.
- Keeps the compiled projection, event queue and transient runner state out of the document to bound file growth.
- History is stored within the Workbench extension and therefore follows the `.sketchizi` document. Ordinary `.excalidraw` files and unknown extension data remain unchanged.

## Data contract

`simulationHistory` is an optional array on `extensions["com.sketchizi.workbench"]`. Each entry uses `schemaVersion: 1`; unsupported or malformed entries are rejected by the restore helper rather than executed. History is capped at five entries, and duplicate IDs are de-duplicated.

## Validation

- `tests/simulation-history.test.js`: snapshot compactness, result restoration without rerun, `.sketchizi` serialization round-trip, unknown-extension preservation, five-entry cap/de-duplication, malformed-entry rejection.
- Full Node suite: 248 passed, 0 failed.
- JSX syntax checks for the three edited UI entry files passed.
- Production build: not verified. The prebuild script reports that `@excalidraw/excalidraw/dist/prod/fonts` is missing from `node_modules`; dependency installation is required.
- Browser workflow: not verified in this environment.

## Limits

History entries are immutable snapshots, not executable simulations. Opening them does not revalidate or rerun the historical model. The UI compares their recorded model revision with the current revision and flags stale results. There is no delete/export-per-run action in this prototype; document-level history is limited to five entries to keep file size bounded.
