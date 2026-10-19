# Sketchizi Workbench 0.69 — Diagnostic Bundle Verification

## Summary

Adds a dependency-free verifier for the ZIP diagnostic bundle produced by the Workbench release gate. The verifier checks ZIP structure and CRC values, validates the embedded manifest, compares the manifest file list with the archive entries, and verifies each listed file's byte count and SHA-256 digest.

## Changes

- Added `scripts/verify-workbench-diagnostic-bundle.mjs` and `npm run verify:workbench-diagnostic-bundle`.
- Added `npm run test:workbench-diagnostic-verifier` with tests for intact bundles, altered content, missing and unexpected entries, missing/malformed manifests, invalid ZIP data, and release-status separation.
- Rejects unsupported/encrypted ZIP entries, duplicate or unsafe paths, oversized entries/archives, corrupt CRCs, and malformed directory bounds.
- Reports the recorded release status separately from integrity. A valid archive whose manifest says `failed` remains a failed release; integrity verification does not imply release success.

## Verification performed

- Diagnostic bundle/redaction/failure-analysis tests: 12 passed.
- Local release-runner tests: 9 passed.
- New diagnostic verifier tests: 7 passed.
- Package-lock consistency tests: 6 passed.
- JavaScript syntax check: passed.

The production build, full release gate, browser workflow, and live PostgreSQL validation were not run for this change.
