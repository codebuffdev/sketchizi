# Sketchizi Workbench 0.29 — k6 Summary Import Adapter

## Scope

This increment extends the existing load-test evidence workflow with a guarded adapter for k6 summary JSON. It does not change the simulation engine or claim production-capacity accuracy.

## Changes

- Detects k6 summary JSON containing `metrics.http_reqs`, `metrics.http_req_failed`, and `metrics.http_req_duration`.
- Requires an explicit top-level `sketchizi` metadata object with `name`, `testedAt`, `targetEnvironment`, `durationSeconds`, and `offeredRps`. This context is not reliably derivable from the k6 summary metrics alone.
- Maps `http_reqs.values.rate` to offered request rate, `http_req_failed.values.rate` to measured error percentage, `http_req_duration.values['p(95)']` to p95 latency, and `vus_max.values.max` (or `vus.values.max`) to concurrency when present.
- Estimates successful throughput as `http_reqs.rate * (1 - http_req_failed.rate)` and writes an explanatory note so the metric interpretation remains visible.
- Keeps the existing Sketchizi JSON record/template import intact. The UI copy now explains supported k6 input and the metadata requirement.
- Does not directly parse raw JMeter CSV/JTL, infer infrastructure capacity, import CPU/memory metrics absent from the report, or fetch telemetry automatically.

## Verification

- Focused calibration tests: **11 passed, 0 failed**.
- Combined calibration, simulation engine/model, infrastructure profiles, persistence, artifacts, Workbench UI/model/validation, POC and browser-fixture regression run: **127 passed, 0 failed**.
- Production build attempted but blocked before Vite: `scripts/copy-excalidraw-fonts.mjs` cannot find `node_modules/@excalidraw/excalidraw/dist/prod/fonts`.
- `npm ci` did not complete within the available execution window; offline retry confirmed the npm cache lacks required registry responses (`ENOTCACHED`). Thus a full dependency-backed production build and real-browser UI run remain unverified.

## Suggested Git commit

`feat(workbench): import k6 summary load-test evidence`
