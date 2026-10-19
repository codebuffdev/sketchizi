# Workbench 0.67 — Failure-analysis regression corpus

## Purpose

Exercise release failure classification against a versioned fixture corpus based on previously observed Workbench release-gate failure patterns. The fixtures are representative captured-style excerpts, not claimed to be byte-for-byte production logs.

## Changes

- Added a nine-case diagnostic corpus for registry DNS, administrator policy blocks, dependency resolution, Vite compilation, test assertions, OpenAPI contract validation, PostgreSQL execution, browser assertions, and application runtime exceptions.
- Added regression checks that compare every corpus entry to its expected classification.
- Narrowed the test-failure pattern so phrases such as `OpenAPI validation failed` are not misclassified as generic test failures.
- Added an explicit application-runtime-defect category for common JavaScript runtime exceptions.
- Prioritized browser-specific assertions ahead of generic assertion matching.
- Verified the first actionable failure follows release-summary order when earlier failures have recognizable evidence; later errors do not displace it.
- Preserved the original release verdict. The analyzer remains heuristic and cannot prove root cause.

## Verification

- `node --test tests/workbench-release-failure-analysis.test.mjs tests/workbench-diagnostic-bundle.test.mjs`: 9 passed, 0 failed.
- JavaScript syntax check: passed.
- Package-lock consistency checks: pending in this environment.
- Production build, actual Chromium workflow, external OpenAPI/SQL validation, live PostgreSQL, and GitHub Actions execution: not run.
