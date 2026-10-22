# Sketchizi Workbench 0.58 — Reproducibility Replay and Regression Detection

## Scope

- Adds a saved-history action to rerun a saved experiment's recorded synthetic profile against the current semantic model.
- Reuses the saved traffic-surge multiplier and scope seeds where available.
- Stores the rerun as a new bounded history entry with a reference to the original entry; original evidence is not overwritten.
- Compares matching scenario metrics and identifies worsening successful throughput, p95 latency, and failure-rate deltas.
- Surfaces model/profile/engine and scenario-set comparability warnings.

## Interpretation boundary

A rerun against a changed model is not a bit-for-bit reproduction. These are synthetic simulation outputs, not production telemetry or proof of real-world behavior. Missing or incomplete metrics are shown as unavailable, not zero. New or unsupported model elements can block a replay rather than being silently assigned assumed behavior.

## Verification

- `npm run test:simulation`: 154 passed, 0 failed.
- `node --test tests/simulation-history-library-ui.test.js`: 2 passed, 0 failed.
- `node --check src/features/simulation/runWorkbenchExperiments.js`: passed.
- Production Vite build and Chromium browser smoke were not run; dependency installation and browser verification remain outstanding.
