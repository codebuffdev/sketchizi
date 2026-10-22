# Workbench 0.76 — CI run identity verification

## Change

Hardened `scripts/run-workbench-ci.ps1` so downloaded evidence is accepted only after the selected GitHub Actions run is verified against the expected release workflow, requested branch, and local commit SHA. When the helper dispatches a new run, it additionally requires the `workflow_dispatch` event. This closes a selection gap where a run ID from another workflow or branch could otherwise be inspected if its commit SHA happened to match.

The helper still does not push code. Existing per-run download isolation and exact diagnostic ZIP selection remain in place.

## Tests performed

- CI helper source-contract tests: 5 passed.
- CI workflow, local release runner, summary, diagnostic import, bundle packaging, redaction, failure analysis, and integrity verifier suites: 60 passed.
- Simulation regression suite: 162 passed.
- Package-lock consistency tests: 6 passed.
- Manifest/lockfile consistency: 19/19 checks passed.
- JavaScript syntax check for the diagnostic importer: passed.
- ZIP archive integrity: passed.

## Verification boundary

The PowerShell helper was not executed against an authenticated GitHub account; PowerShell is unavailable in this environment. No live GitHub Actions run, clean dependency installation, production Vite build, rendered Chromium workflow, or live PostgreSQL execution is claimed. The new tests validate source contracts and existing local components, not a real remote run.
