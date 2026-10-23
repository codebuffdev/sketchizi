# Phase 11 — Architecture Comparison and Scoring

## Delivered

- Added a pure comparison module for normalized system-design graphs.
- Scores each candidate deterministically on a 0–100 scale using the existing architecture quality findings.
- Uses transparent deductions: error 15, warning 7, informational finding 2, with a floor of zero.
- Reports grade, component/connection counts, severity counts, strengths, finding differences, metric deltas, and a relative winner/tie.
- Includes explicit caveats: scores are heuristic and do not measure cost, latency, throughput, availability, or production readiness.
- Adds automated tests for normalization, determinism, scoring bounds, comparison, deltas, and malformed inputs.

## Important scope boundary

This phase delivers a reusable comparison/scoring engine. It does not yet add a user-facing two-canvas comparison screen, and it does not automatically infer equivalent components across designs. Stable semantic IDs improve the usefulness of finding-level differences.

## Verification

Run `npm run test:system-design-comparison` and `npm run test:all`. The production build should be verified separately in an environment with dependencies installed.
