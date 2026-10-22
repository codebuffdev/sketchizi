# Workbench 0.75 — Run-isolated CI evidence collection

## Change

Fixed a stale-artifact hazard in the PowerShell GitHub Actions helper. Previously, all downloads shared one directory and the helper selected the first ZIP it found, which could accidentally analyze evidence left by an earlier run.

The helper now creates a `run-<id>` directory, clears only that run-specific directory before download, and accepts only `workbench-release-diagnostic-bundle.zip`. If the expected archive is absent, it fails with an explicit message instead of inspecting an unrelated ZIP.

## Verification boundary

Source-level helper contract tests validate run isolation and expected filename selection. A live GitHub Actions run has not been performed in this environment, so no production build, browser, or live PostgreSQL result is claimed.
