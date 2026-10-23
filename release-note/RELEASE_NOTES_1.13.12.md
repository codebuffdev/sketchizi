# Sketchizi 1.13.12 — Kubernetes Review Navigation

## Improvements
- Dashboard shortcuts now navigate to their destination after applying the relevant filter.
- Added stable section targets for findings, remediation, review history, and snapshot comparison.
- Added visible active-filter summaries and section-specific clear actions for findings, comparison, and remediation.
- Filter reset actions change only the view state; they do not alter findings, saved snapshots, or remediation task status.
- Improved active-filter layout on narrow viewports.

## Verification
- Automated Kubernetes review and architecture regression suite.
- JavaScript syntax checks for relevant non-JSX services.
- ZIP integrity and package version checks.
- Production build/browser testing was not run because project dependencies are unavailable in this environment.
