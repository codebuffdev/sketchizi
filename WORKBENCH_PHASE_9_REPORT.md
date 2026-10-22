# Workbench Phase 9 — Adaptive Desktop Grid

## Changes
- Reworked wide-desktop grid tracks to use viewport-relative side lanes and a shrinkable `minmax(0, 1fr)` canvas track.
- Applied the same adaptive sizing to left-docked and right-docked arrangements.
- Added a regression test that guards against reintroducing rigid canvas minimum widths in the desktop grid.
- Kept package version at 1.10.86 and did not change the engineering model or persistence schema.

## Verification
- Focused Workbench layout, registry, document prototype, and persistence lifecycle tests are run for this phase; results are recorded in the delivery response.
- Production build and browser visual verification are not run because dependencies are not installed in the source bundle.
