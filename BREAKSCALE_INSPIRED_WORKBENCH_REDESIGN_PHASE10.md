# Breakscale-inspired Workbench redesign — Phase 10

## Goal
Make typed relationship creation understandable before a user commits it, while preserving the existing semantic-model validation and scene synchronization path.

## Changes
- Added a live connection preview in the relationship inspector, showing source, target, and selected relationship type.
- Shows a specific explanation when no target is selected, endpoint kinds are incompatible, or the same typed relationship already exists.
- Disables creation for duplicate relationships before submission; the controller continues to perform authoritative model validation at commit time.
- Added compact, theme-token-aware styling for valid and invalid preview states.
- Preserved package version 1.10.86 and did not change persistence or semantic model shape.

## Verification
Run the focused Workbench regression suite and the Phase 10 UI tests. Production build and live-browser verification must be completed in an environment with installed dependencies.
