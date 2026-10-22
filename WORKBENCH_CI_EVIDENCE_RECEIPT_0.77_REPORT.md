# Workbench CI Evidence Receipt — 0.77

## Changes

- Added `scripts/write-workbench-ci-evidence-receipt.mjs` to create JSON and Markdown receipts for downloaded and integrity-verified CI bundles.
- Bound receipt metadata to the expected workflow, completed run, requested branch, local HEAD SHA, run URL, conclusion, and exact bundle filename.
- Reverified the actual ZIP and manifest independently before writing the receipt; matched adjacent analysis metadata to the archive rather than trusting the sidecar report alone.
- Recorded the bundle byte count and SHA-256 plus the importer's integrity and analysis outputs.
- Updated `scripts/run-workbench-ci.ps1` to reject zero or multiple matching diagnostic archives and produce the evidence receipt after import succeeds.
- Added regression tests for valid receipts, failed-run preservation, commit/branch/workflow/status/conclusion mismatches, invalid URLs, corrupted archive rejection, and report/bundle mismatch.

## Verification boundary

The receipt hash is not a digital signature. The actual GitHub Actions helper was not executed against an authenticated repository as part of this implementation. Production build, browser E2E, and live PostgreSQL results remain unverified.
