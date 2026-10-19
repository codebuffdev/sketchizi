# Workbench 0.66 — First-failure analysis

## Purpose

Turn the release summary and captured command logs into a prioritized triage report. The analysis is generated automatically during diagnostic-bundle packaging and is also available as `npm run analyze:workbench-release-failure`.

## Outputs

- `artifacts/workbench-release-failure-analysis.json`
- `artifacts/workbench-release-failure-analysis.md`

Both outputs are included in the diagnostic ZIP and uploaded separately by the release-gate workflow.

## Behavior

- Selects the earliest failed/cancelled/timed-out/action-required/unknown stage in release-summary order; skipped stages are considered only when no failed stage exists.
- Uses the mapped stage log when available and classifies recognizable registry/network, environment-policy, dependency-resolution, build, test, OpenAPI, SQL/PostgreSQL, and browser errors.
- Records the evidence log path, a bounded excerpt, confidence label, and recommended next action.
- Keeps unclassified failures visible and reports missing/invalid summary data as inconclusive.
- Does not change the release status.

## Limits

Classification is heuristic evidence triage, not proof of root cause. A green analysis is not a substitute for a passing release gate, production build, real browser run, or live PostgreSQL validation.
