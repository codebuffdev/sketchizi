# Sketchizi Workbench 0.73 — CI Diagnostic Bundle Import

## Summary

This release adds a local command for inspecting a diagnostic ZIP downloaded from GitHub Actions. It verifies the archive and its embedded manifest before analyzing the first actionable release failure.

## Usage

```bash
node scripts/inspect-workbench-release-diagnostic-bundle.mjs path/to/workbench-release-diagnostic-bundle.zip
```

The command writes two files beside the downloaded ZIP:

- `<bundle-name>.failure-analysis.json`
- `<bundle-name>.failure-analysis.md`

It uses a temporary directory to analyze the imported evidence and does not overwrite the project's current `artifacts/` directory. Invalid or tampered archives are rejected before analysis.

A valid diagnostic archive may still record a failed release. The command's exit status indicates whether import and inspection succeeded; it does not indicate whether the original release passed.

## Verification performed

- Diagnostic bundle import tests: 3 passed, 0 failed.
- Combined local release, CI contract, and diagnostic verification tests: 39 passed, 0 failed.
- Package manifest/lockfile consistency: 19/19 checks passed.
- Simulation regression suite: 162 passed, 0 failed.
- JavaScript syntax checks: passed.
- ZIP integrity: verified after packaging.

## Limitations

No real GitHub Actions run was triggered from this environment. This feature is intended to consume the diagnostic ZIP once a real run has been triggered and its artifact downloaded. It does not replace the production build, rendered-browser smoke test, or live PostgreSQL validation.
