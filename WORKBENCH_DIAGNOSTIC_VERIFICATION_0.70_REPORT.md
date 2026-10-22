# Sketchizi Workbench 0.70 — Diagnostic Bundle Verification Gate

## Changes

- Run the diagnostic bundle verifier immediately after packaging in the local release runner.
- Add a dedicated GitHub Actions verification step that runs even when packaging reports a failed release, so available diagnostic evidence is still checked.
- Emit `artifacts/workbench-release-diagnostic-verification.json` with integrity status, checked file count, recorded release status, warnings, and validation errors.
- Fail the release gate if the archive is missing, corrupt, incomplete, or inconsistent with its manifest.
- Keep bundle integrity separate from application release status: a valid archive can still document a failed release.
- Fix a real packager/verifier contract mismatch: the ZIP stores the manifest at its root, while the verifier previously searched under `artifacts/`. The verifier now uses the actual archive path.
- Add integration coverage that creates an archive with the production diagnostic packager and verifies that archive end to end.

## Verification

- `npm run test:simulation`: 162 passed, 0 failed.
- `npm run test:workbench-diagnostic-bundle`: 12 passed, 0 failed.
- `npm run test:workbench-local-release`: 10 passed, 0 failed.
- `npm run test:workbench-ci-contract`: 12 passed, 0 failed.
- `npm run test:workbench-diagnostic-verifier`: 10 passed, 0 failed.
- `npm run test:package-lock-consistency`: 6 passed, 0 failed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- JavaScript syntax checks for the release runner and verifier passed.
- A real archive produced by `createDiagnosticBundle()` was verified successfully in an integration test. The test intentionally uses a `not-passed` release summary and confirms that integrity verification does not change the recorded release status.
- ZIP archive integrity is checked after packaging the deliverable.

## Not verified in this environment

- Clean `npm ci` and production Vite build.
- Actual GitHub Actions execution.
- Real Chromium browser workflow.
- Live PostgreSQL DDL execution.

These remain required release checks and are not implied by the passing unit/integration tests above.
