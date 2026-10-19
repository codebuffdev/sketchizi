# Workbench 0.65 — Downloadable Release Diagnostic Bundle

## Summary

This release adds a dependency-free diagnostic bundle packager for the Workbench release gate. The local release runner and GitHub Actions workflow both produce a ZIP archive plus a standalone JSON manifest.

## Bundle contents

- Release gate JSON and Markdown summaries
- Command logs under `artifacts/ci-logs/`
- Generated OpenAPI and PostgreSQL SQL fixtures under `artifacts/generated/`
- Browser smoke result when available
- Embedded `workbench-release-diagnostic-manifest.json`

The manifest records the release verdict, failed and skipped stages, all included files with byte counts and SHA-256 hashes, and required artifacts missing at packaging time. Missing files are explicitly listed rather than represented as successful results. Packaging does not change the release verdict.

## Reliability details

- Uses Node.js built-ins only; no extra ZIP dependency is required.
- Excludes the prior bundle and standalone manifest from the file inventory to prevent self-inclusion.
- Clears generated fixtures at the start of the local gate so stale files from an earlier run cannot be mistaken for current artifacts.
- Keeps diagnostics packaging under `if: always()` in GitHub Actions, so a failed release gate can still upload its bundle.

## Verification

- Diagnostic bundle, local release runner, CI contract, and summary tests: 33 passed
- Simulation regression suite: 162 passed
- Workbench artifact tests: 11 passed
- Workbench format/persistence tests: 22 passed
- Package-lock consistency tests: 6 passed
- Package manifest/lockfile consistency: 19/19 checks passed
- JavaScript syntax checks: passed
- Generated ZIP archive: `unzip -t` passed on a representative fixture bundle

A clean dependency installation, production Vite build, real Chromium browser smoke, external OpenAPI/SQL validation, live PostgreSQL execution, and GitHub Actions run were not performed in this environment. The bundle generator is tested with synthetic fixture directories; this is not evidence that the full release gate passes.
