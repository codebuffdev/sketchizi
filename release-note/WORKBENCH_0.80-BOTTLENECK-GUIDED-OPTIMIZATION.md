# Sketchizi Workbench 0.80 — Bottleneck-Guided Optimization

## Goal

Move the simulation workflow from reading results to choosing a grounded next experiment. Recommendations must be derived from the selected completed scenario and only propose interventions supported by existing model/profile evidence.

## Implemented

- Added `recommendSimulationImprovements` to the simulation experiment model.
- Ranks evidence-backed hypotheses for concurrency, mean service time, PostgreSQL write contention, and an eligible modeled index candidate.
- Uses component drops, failures, utilization, queue-wait p95, service-time p95, recorded write-contention totals, and read/index eligibility evidence.
- Only proposes concurrency/service-time trials for in-scope supported runtime components with adjustable assumptions.
- Only proposes write-contention changes when a typed `Writes` relationship and positive modeled contention evidence exist.
- Only proposes index hypotheses for the existing eligible typed-read/table/column candidate rules.
- Presents up to four recommendations, one per intervention family, ranked deterministically; each can launch the existing controlled before/after experiment.
- Keeps the canonical model and saved base profile unchanged. Results are persisted through the existing experiment history path.
- Added `npm run test:optimization-recommendations` and included its tests in `npm run test:simulation`.

## Boundaries

- Recommendations are heuristics for synthetic what-if experiments, not automatic production fixes.
- A high utilization, large queue wait, service time, or modeled contention signal does not establish a live-system root cause.
- An index candidate is only a model-backed hypothesis; the engine does not consult PostgreSQL query plans.
- The full production build and real-browser UI workflow were not run in this environment.

## Verification

- `npm run test:simulation`: **171 passed, 0 failed**.
- Focused improvement tests (capacity, service-time, write-contention, index, recommendation): **27 passed, 0 failed**.
- `npm run test:workbench-format`: **22 passed, 0 failed**.
- `npm run test:package-lock-consistency`: **6 passed, 0 failed**.
- `SimulationExperimentPanel.jsx` parsed with the installed TypeScript JSX parser.
- ZIP integrity checked after packaging.

Production Vite build, Chromium browser smoke, live PostgreSQL validation, and full release gate remain unverified.
