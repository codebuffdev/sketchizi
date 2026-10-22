# Sketchizi Workbench 0.59 — Reproducibility Validation

## Scope

- Adds a strict reproducibility assessment for saved experiment history versus a replay.
- An `exact-match` verdict requires complete matching scenario coverage, matching model/profile/engine/runner provenance, matching per-scenario run fingerprints, and matching recorded metrics.
- Distinguishes matching metrics with changed provenance from metric differences and incomplete runs.
- Detects the suspicious case where metrics differ despite an identical run fingerprint.
- Surfaces the verdict in the saved-experiment rerun report while retaining existing regression deltas and warnings.
- Adds tests for exact replay, altered provenance, altered metrics, missing scenarios, malformed inputs, and changed simulation seeds.

## Interpretation boundary

An exact match is evidence that this deterministic simulator reproduced its recorded synthetic output under matching recorded inputs. It is not a guarantee of production behavior or proof that the model captures all real-world conditions.

## Verification

- `node --test tests/simulation-history.test.js`: 13 passed, 0 failed.
- `npm run test:simulation`: 157 passed, 0 failed.
- `node --check src/features/simulation/experiments/simulationHistory.js`: passed.
- `node --check src/features/simulation/runWorkbenchExperiments.js`: passed.
- Production Vite build and Chromium browser smoke were not run; no full browser workflow claim is made.
