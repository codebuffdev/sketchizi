# Sketchizi 1.11.8 — Kubernetes Validation Guidance

## Added
- Added remediation guidance to Kubernetes semantic relationship diagnostics.
- Invalid endpoint-type pairs now show compatible relationship type alternatives sourced from the shared Kubernetes semantics module.
- Unknown relationship types list supported alternatives.
- Orphan-resource and duplicate-resource-ID diagnostics explain how to resolve the finding.
- Updated the Architecture Validation panel to display remediation and type suggestions in light and dark themes.
- Added `npm run test:kubernetes-validation`.

## Verification
Run the Node.js test suites documented in the release handoff. A production build and browser verification are separate checks and should be performed in an environment with dependencies installed.
