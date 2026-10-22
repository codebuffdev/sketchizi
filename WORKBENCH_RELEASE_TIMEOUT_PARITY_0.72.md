# Workbench 0.72 — CI Step Timeout Parity

## Changes

- Added explicit GitHub Actions step-level timeouts for clean install, build, regression suites, external validators, PostgreSQL execution, Chromium/browser smoke, and diagnostic packaging/upload.
- Raised the job-level timeout from 35 to 120 minutes so independent diagnostics and upload can still run after a long stage reaches its own timeout.
- Added workflow contract coverage to prevent release-critical stages from losing their timeout bounds.
- Kept strict release outcomes: a timed-out stage fails; dependent stages remain skipped; diagnostics still run when the job remains within its overall time budget.

## Verification limits

This change validates workflow configuration statically. It does not claim that GitHub Actions has been executed, nor that clean install, production build, Chromium, OpenAPI/SQL validators, or live PostgreSQL passed.
