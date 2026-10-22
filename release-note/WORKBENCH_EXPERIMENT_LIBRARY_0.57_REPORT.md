# Sketchizi Workbench 0.57 — Persistent Experiment Library

## Changes

- Added editable names to retained simulation history entries while preserving their recorded results and provenance.
- Added search across saved experiment names, scenario labels, status, engine version, and model/profile fingerprints.
- Added selection of two retained suites and a comparison table for matching scenarios: successful throughput, p95 latency, and failure rate.
- Missing scenarios or metrics are displayed as unavailable rather than treated as zero.
- Comparison warnings disclose differences in model fingerprints, profile fingerprints, engine versions, and scenario sets.
- The library remains document-persisted through the existing `.sketchizi` Workbench extension and retains the existing latest-five bound.

## Validation

- `npm run test:simulation`: 152 passed, 0 failed.
- `node --test tests/simulation-history.test.js tests/simulation-history-library-ui.test.js`: 11 passed, 0 failed.
- `node --check src/features/simulation/experiments/simulationHistory.js`: passed.
- `git diff --check`: passed.
- ZIP integrity: passed.
- Production Vite build and real-browser smoke: not run; dependencies/browser verification were not available in this run.

## Interpretation boundary

History comparisons use previously recorded synthetic simulation outputs. They do not rerun the engine, establish production behavior, or prove that changed results were caused solely by a single model change. Provenance warnings must be reviewed before interpreting deltas.
