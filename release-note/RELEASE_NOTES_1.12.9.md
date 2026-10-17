# Sketchizi 1.12.9

## Kubernetes deployment review comparison export

- Added Markdown and JSON export actions after comparing a baseline or saved review snapshot.
- Reports include comparison totals, added/changed/resolved/unchanged findings, severity transitions, message and remediation differences, and changed relationship details.
- Resolved findings preserve the previous finding and remediation details.
- Export uses an allowlist of Kubernetes finding fields and excludes the full diagram and arbitrary metadata.
- Updated the Kubernetes deployment review workflow documentation.

Verification: automated targeted and regression tests; JavaScript syntax checks; release ZIP integrity. Production build and interactive browser testing were not run in this environment.
