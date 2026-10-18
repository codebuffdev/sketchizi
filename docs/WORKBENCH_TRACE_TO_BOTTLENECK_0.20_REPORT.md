# Sketchizi Workbench 0.20 — Trace-to-Bottleneck Investigation

## Objective

Connect request-level traces to the event-derived performance charts and the canvas runtime overlay, so a user can move from a sampled request to the component that has the strongest recorded timing/failure evidence.

## Changes

- Added `src/features/simulation/experiments/traceInvestigation.js` with pure helpers for selecting an actionable hop and finding the time-series buckets overlapped by the hop's recorded time window.
- Successful traces select the processing hop with the largest recorded queue-wait + service-time contribution. Non-successful traces select the recorded terminal failed, unavailable, or dropped hop. The UI does not invent missing service timings or claim a causal explanation beyond the trace evidence.
- Added an **Investigate on charts & canvas** action to the Request-level traces inspector.
- When the selection has recorded timestamps, the relevant event-derived chart interval is highlighted and the Performance over time section opens automatically.
- The canvas runtime overlay validates the selected request ID, hop index, entity ID and scenario against the retained trace before marking the matching component with a trace-focus highlight.
- Starting a new experiment, changing model/profile inputs, or restoring history clears the previous transient trace investigation.
- Added light/dark styling and tests for successful slow-hop selection, failure-point selection without fabricated timing, time-bucket mapping, and strict overlay target validation.
- Added `npm run test:trace-investigation`; also included the new tests in `npm run test:simulation`.

## Verification

- Focused investigation, request-trace UI, and runtime-overlay suites: **13/13 passed**.
- Regression test command groups: **10/10 passed**, with **264 test executions and 0 failures** across simulation, simulation guidance, simulation experiments, artifacts, POC, Workbench UI, Workbench validation, Workbench format/persistence, collaboration sync, and browser-verification server tests. These groups overlap; this is the sum of executions, not a count of unique tests.
- TypeScript JSX parser checks passed for:
  - `src/features/simulation/experiments/SimulationExperimentPanel.jsx`
  - `src/components/app/SketchiziCanvas.jsx`
- ZIP integrity check passed after packaging.
- Production build **not verified**. `npm run build` exits in `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent. Vite never starts in this worktree.
- Real-browser interaction **not verified**. The new cross-link needs to be exercised locally with the browser and full dependency installation.

## Local verification

From PowerShell in `sketchizi-main`:

```powershell
npm ci
npm run build
npm run test:trace-investigation
npm run test:simulation
npm run dev
```

Then run a scenario, open Request-level traces, select a slow successful request or a failed request, and choose **Investigate on charts & canvas**. Confirm that the correct component gets the trace-focus badge and the recorded hop interval is highlighted in the event-derived charts. Switch scenarios and edit an assumption to confirm old trace focus does not leak into a different or stale run.

## Boundaries

- This is a transient investigation selection; it does not mutate the semantic model or saved Excalidraw elements.
- The highlight represents recorded timestamps and overlapping chart buckets, not continuous per-millisecond telemetry.
- The traces remain bounded samples from the synthetic discrete-event engine, not live distributed traces.
- The package version remains the existing app version `1.10.86`; `0.20` is a Workbench iteration label, not a formal app release.
