# Sketchizi Workbench 0.30 — JMeter CSV / XML JTL Import Adapter

## Scope

This increment extends the Workbench 0.28 calibration workflow and 0.29 k6 JSON adapter with raw, sample-level Apache JMeter result import. It does not change the simulation engine or claim production-capacity accuracy.

## What changed

- Adds format selection in the Workbench's Load-test evidence & calibration panel:
  - Existing Sketchizi / k6 summary JSON import remains available.
  - Apache JMeter sample-level CSV / JTL is supported.
  - Apache JMeter XML JTL is supported.
- JMeter import requires explicit test metadata: test name, date, target environment, configured offered RPS, and configured duration. JTL rows only reflect recorded samples; the adapter does not infer intended offered load or full configured test duration from completed results.
- Calculates successful completed throughput as successful sample count divided by the explicitly supplied test duration.
- Calculates p95 from individual sample elapsed times using nearest-rank percentile, and measured error rate as the proportion of sample rows with a false success flag.
- Reads maximum `allThreads` / `na` when present; a user can supply an explicit concurrency override when the export does not include it.
- XML JTL excludes sample parents that contain nested sample elements to avoid counting transaction-controller totals together with nested sampler requests. CSV sample rows are used as exported; the UI warns users to avoid CSV exports that duplicate transaction-controller parent rows and their child sampler rows.
- Explicitly rejects JMeter Aggregate Report CSV because per-label percentiles cannot be combined into a defensible global p95. It also rejects unsafe XML DTD/entity declarations, malformed critical fields, oversized files (>10 MB text) and exports above 250,000 samples.
- Measurements remain evidence. The adapter does not fetch live telemetry, estimate CPU/RAM-derived capacity, or apply calibration parameters automatically.

## Verification

- Focused calibration importer suite: **15 passed, 0 failed**.
- Simulation regression suite: **124 passed, 0 failed**.
- Workbench artifacts: **11 passed**; UI/model: **32 passed**; validation: **25 passed**; POC: **13 passed**; format/persistence: **22 passed**; infrastructure/persistence: **9 passed**; browser verification server: **6 passed**; browser fixture: **1 passed**.
- `SimulationExperimentPanel.jsx` passed TypeScript transpile syntax diagnostics (zero errors). `loadTestCalibration.js` passed `node --check`.
- ZIP archive integrity verified.
- Production build attempted but blocked before Vite by `scripts/copy-excalidraw-fonts.mjs`, which could not find `node_modules/@excalidraw/excalidraw/dist/prod/fonts`. Because required dependencies are unavailable in the extracted environment, the full React UI was not verified in a real browser.
- These are synthetic fixture/unit tests; no actual customer JMeter export was supplied for validation in this run.

## Next recommended action

Close the existing production build and real-browser verification gate on a machine with dependencies installed, then validate the JSON, k6, JMeter CSV and XML JTL adapters against representative real exports and reconcile their metric definitions before expanding calibration behavior.

## Suggested Git commit

`feat(workbench): import JMeter CSV and XML JTL evidence`
