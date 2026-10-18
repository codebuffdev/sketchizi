# Sketchizi Engineering Workbench 0.14.5 — Typed Connection Guidance

## Summary

This is a focused UX and diagnostics fix for the blocked experiment workflow in screenshots dated 2026-10-18. The semantic simulation rules are not relaxed: Sketchizi does not infer runtime topology from ordinary drawing arrows.

## Changes

- Added inline **Connect the typed request path** guidance for an unambiguous active-view React → REST service → PostgreSQL setup.
- The guide explains that ordinary Excalidraw arrows are visual-only and shows the correct relation directions.
- Added focus buttons for the source components so the user can create each typed relationship in the existing Inspector.
- Added a specific `RUNNER-TYPED-REQUEST-PATH-MISSING` blocker and a clearer outside-scope outage diagnostic.
- Improved the low-level traffic-source error text to reference typed `Calls` relationships.
- Added a new `npm run test:simulation-guidance` script.

## Test results

- Full Node suite: **272 passed, 0 failed**.
- Focused simulation, history, guidance, and layout suites: **62 passed, 0 failed**.
- ZIP integrity: passed.
- Build and real-browser verification of the changed UI: **not verified** in this environment. The package's missing Excalidraw font dependencies continue to prevent a confirmed production build.

## Local verification

Apply the patch ZIP into the existing `sketchizi-main` folder, then run:

```powershell
npm run test:simulation-guidance
npm run dev -- --force
```

In the Workbench panel, the guide should appear when the active view contains one React application, one REST service and a PostgreSQL database without the necessary typed relations. Create `Calls` from React to REST, then `Reads from` or `Writes to` from REST to PostgreSQL using the Inspector. After the model path expands, review/save profile inputs if needed, re-acknowledge synthetic assumptions, and rerun the experiments.

The original stable v1.10.86 baseline was not modified.
