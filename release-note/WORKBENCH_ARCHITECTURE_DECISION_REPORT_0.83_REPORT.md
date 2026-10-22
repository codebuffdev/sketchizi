# Sketchizi Workbench 0.83 — Architecture Decision & Recommendation Report

## Product increment

- Adds a report helper that combines the saved-baseline architecture diff with matched simulation outcomes, selected bottleneck signals, active trace evidence, evidence-guided optimization candidates, and the session-local optimization portfolio.
- Produces an explicit decision state: baseline unavailable, no semantic change, insufficient comparable simulation evidence, hold for regressions, mixed trade-off, promising synthetic result, or no demonstrated directional improvement.
- Reports only comparable simulation deltas supplied by the existing architecture-impact gate. Missing or context-mismatched metrics remain unavailable.
- Shows architecture change counts, up to four bottlenecks and candidate experiments, ranked portfolio results, risk/evidence gaps, recommended next steps, and modeling limitations.
- Adds an export action for a portable Markdown decision report.
- Uses metric-aware formatting for throughput, latency, request counts, and success-rate percentage-point changes.
- Explicitly distinguishes synthetic simulation from production evidence. Existing load-test records are counted but are not presumed to match the proposed architecture, workload, or component scope.
- Does not automatically mutate the architecture or approve rollout.

## Verification

- `npm run test:simulation`: **189 passed** (includes the new decision report tests).
- `npm run test:architecture-decision-report`: **18 passed** (report, architecture impact and portfolio tests).
- `npm run test:workbench-format`: **22 passed**.
- `npm run test:workbench-artifacts`: **11 passed**.
- `npm run check:package-lock-consistency`: **19/19 checks passed**.
- `node --check` passed for the new pure report helper and its tests.
- Production Vite build and real browser interaction were not run because the archive has no local Vite executable/dependencies. The JSX file was not validated by `node --check` because Node does not directly parse `.jsx` files.

## Interpretation boundary

The report is a decision aid over model diffs and available experiment evidence. A favorable simulation result does not prove real-world improvement. Production-like load testing, operational service objectives, review of rollout/rollback risk, and responsible owner approval remain required.

## Suggested commit

`feat(workbench): generate architecture decision and recommendation reports`
