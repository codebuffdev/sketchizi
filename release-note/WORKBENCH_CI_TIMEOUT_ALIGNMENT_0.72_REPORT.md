# Sketchizi Workbench 0.72 — CI Timeout Alignment

## Summary

This release aligns GitHub Actions step-level timeouts with the bounded local release runner, so slow installation, validation, regression, and browser stages produce an explicit failed stage instead of consuming the whole job window without a focused result.

## Changes

- Increased the CI job-level timeout to 90 minutes so bounded stages have room to finish and still produce diagnostics.
- Added explicit step-level timeouts for registry probing, clean install, font preflight, production build, application and Workbench regression suites, fixture generation, external validators, OpenAPI/SQL validation, PostgreSQL execution, Chromium installation, browser smoke, summary generation, diagnostic packaging/verification, and artifact uploads.
- Added CI contract coverage for the configured timeout values and updated the diagnostics contract to permit step-level timeout metadata.
- Preserved the existing `always()` diagnostics flow and strict release verdict; timeouts do not turn failed stages into passes.

## Verification performed

- CI contract, local release runner, release summary, and package-lock tests: 41 passed, 0 failed.
- Simulation regression suite: 162 passed, 0 failed.
- Artifact, diagnostic bundle, redaction, failure analysis, integrity verifier, and PostgreSQL safety/orchestration tests: 45 passed, 0 failed.
- Package manifest/lockfile consistency checker: passed.
- JavaScript syntax checks: passed.
- GitHub Actions workflow YAML parse: passed.
- ZIP integrity: verified after packaging.

## Limitations

No real GitHub Actions run was triggered. Production build, clean dependency installation in CI, actual Chromium browser workflow, and live PostgreSQL execution remain unverified until CI runs in a suitable environment. A local attempt to run the full release gate did not complete in this environment; the extracted project directory also encountered a filesystem permission error during one attempt, so that attempt is not treated as an application test result.
