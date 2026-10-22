# Workbench 0.74 — Run and inspect the real GitHub Actions gate

This helper is intended to close the gap between locally passing tests and the unverified production release gate. It dispatches the existing `workbench-release-gate.yml` workflow, waits for completion, downloads the diagnostics artifact, verifies and analyzes its ZIP, and returns a failing exit code if the CI run failed.

## Requirements

- Run from a Git clone of Sketchizi, not from a ZIP extraction without `.git` metadata.
- Commit and push the intended source first. The helper refuses to dispatch if local `HEAD` differs from `origin/<branch>`; it never pushes changes.
- Install Node.js and the GitHub CLI (`gh`), then authenticate with `gh auth login`.
- Ensure the account has permission to run GitHub Actions and download workflow artifacts.

## Run from PowerShell

```powershell
# From the repository root, with the intended commit already pushed:
.\scripts\run-workbench-ci.ps1

# Explicit branch:
.\scripts\run-workbench-ci.ps1 -Ref main

# Collect and inspect a known run without dispatching another:
.\scripts\run-workbench-ci.ps1 -RunId 123456789
```

The script does not modify Git history or push source. It downloads `workbench-release-gate-diagnostics` under a run-specific directory such as `artifacts/ci-downloads/run-123456789/`. Each run directory is cleared before download, and the helper accepts only the expected `workbench-release-diagnostic-bundle.zip` filename, preventing an old or unrelated ZIP from being mistaken for current evidence. It then runs `scripts/inspect-workbench-release-diagnostic-bundle.mjs` to write adjacent JSON and Markdown analysis reports.

A passing diagnostic ZIP does not imply a passing release. If the GitHub Actions run fails, the script still collects and analyzes the available evidence, then exits non-zero. If artifact upload or integrity verification failed, it reports that as a separate collection/verification problem.

## Current verification boundary

Unit and source-level tests can validate this helper's workflow contract, but only running it with authenticated GitHub access can establish the real CI outcome. No GitHub Actions run is claimed by this report.
