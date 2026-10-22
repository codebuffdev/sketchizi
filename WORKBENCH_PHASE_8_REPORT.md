# Workbench Phase 8 — Navigation Simplification

## Scope
- Removed the duplicate Design Perspectives view selector from the Design tab.
- Kept the top-level Design workspaces navigation as the primary view switcher.
- Preserved the active-view context, design-level summary, model navigator, model data, and persistence.
- Did not change the application package version.

## Verification
- Focused Node test suite executed after changes; results recorded in the delivery summary.
- ZIP archive integrity checked.
- Production build and browser visual verification were not performed in this environment.

## Remaining alignment work
This change reduces duplicate navigation but does not by itself complete the agreed three-region UI or prove visual alignment. The application shell and panel ownership still require running-browser verification and further structural work.
