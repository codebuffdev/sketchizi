# Sketchizi Workbench 0.56 — Saved Evidence Comparison

## Delivered

- Added a parser for exported Sketchizi Workbench simulation evidence JSON, including report type and schema-version validation.
- Added side-by-side comparison of two saved reports, using the first selected file as the earlier run and the second as the later run.
- Compares matched scenario rows for throughput, p95 latency, and failure-rate deltas; null or unavailable values remain unavailable rather than being converted to zero.
- Lists scenarios that only appear in the later report.
- Surfaces comparability warnings when experiment type, model fingerprint, profile fingerprint, engine version, assumptions, or scenario sets differ.
- Added UI tests and included them in `npm run test:simulation`.

## Interpretation limits

This compares exported synthetic model outputs. It does not run the model again, establish production performance, or prove that runs with different assumptions are directly comparable. A positive throughput delta means more modeled throughput; positive p95 latency or failure-rate deltas indicate worse modeled results.

## Verification

- Evidence comparison + evidence report tests: 8 passed, 0 failed.
- Full simulation suite: 151 passed, 0 failed.
- Production Vite build and Chromium browser smoke: not run in this environment; verify in an installed-dependency environment before release.
