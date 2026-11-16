# Sketchizi 1.13.0

## Kubernetes deployment review comparison UX

- Added compact summary metrics for new, changed, resolved, and unchanged findings.
- Added a concise comparison headline and explicit severity-increase/decrease indicators.
- Added severity badges and before/after severity and remediation details to comparison entries.
- Added **Go to finding** actions that route selectable findings through the existing canvas-selection callback.
- Added responsive styling for narrow review panels.

Verification: targeted and regression tests, JavaScript syntax checks, and ZIP integrity. Production build and interactive browser testing were not run because dependencies were not present in the release workspace.
