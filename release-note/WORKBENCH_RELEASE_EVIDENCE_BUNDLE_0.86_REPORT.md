# Sketchizi Workbench 0.86 — Release Evidence Bundle

## Product changes

- Added an export action to the saved architecture decision record UI to download a self-contained JSON release evidence bundle.
- The bundle includes the saved decision record and point-in-time architecture/simulation snapshot, available load-test records, decision validation gates, rollout checks, readiness assessments, audit trail, reported risks, limitations, and unresolved checks.
- Each evidence family is classified: modeled simulation output, user-supplied load-test measurement, manual attestation, record-state assessment, or machine-derived assessment.
- Manual completion flags and evidence references are explicitly not labeled as independently verified. User-supplied load-test records are whitelisted to supported metadata and metrics; arbitrary fields such as credentials are excluded.
- The bundle compares report-snapshot load-test count with the current profile count and flags mismatches instead of claiming the records are the same.
- Exported package is a JSON file, not a signed attestation or a ZIP archive. The bundle preserves recorded evidence; it does not open external references or authorize release.

## Verification

- `npm run test:simulation`: 214 tests passed.
- `npm run test:workbench-format`: 22 tests passed.
- `npm run test:workbench-artifacts`: 11 tests passed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- Targeted release bundle / decision record / rollout readiness tests: 25 passed.
- Production Vite build and real-browser runtime were not verified in this workspace because project dependencies were not installed.

## Suggested Git commit

`feat(workbench): export classified release evidence bundle`
