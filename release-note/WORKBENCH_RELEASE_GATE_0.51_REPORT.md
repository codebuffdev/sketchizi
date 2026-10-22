# Sketchizi Workbench 0.51 — Repeat-run SLO outcome consistency

## Goal

Make repeat-run evidence show whether the individual runs at a similar offered-load level consistently meet the configured SLOs, or whether outcomes are mixed.

## Implemented

- Added passing and failing run counts to each repeat-run offered-load summary.
- Added an explicit per-level outcome: all runs pass, all runs fail, mixed SLO outcomes, or single observation.
- Added UI labels and accessible hover text for the pass/fail counts.
- Styled outcomes for light and dark themes and narrow viewports.
- Kept the existing individual-point SLO decisions and highest-observed-passing-point calculation unchanged.
- Kept target environments isolated and made no statistical-stability or production-capacity claims.
- Added regression coverage for mixed, all-pass, and single-observation levels.

## Verification

- `node --test tests/load-test-calibration.test.js` — PASS, 20/20 tests.
- Full release gate, production build, PostgreSQL integration, and Chromium UI verification have not been run for 0.51 in this environment.

## Suggested Git commit

`feat(workbench): surface repeat-run SLO outcome consistency`
