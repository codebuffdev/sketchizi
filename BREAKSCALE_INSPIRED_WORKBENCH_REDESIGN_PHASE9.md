# Breakscale-inspired Workbench redesign — Phase 9

## Goal
Reduce friction between selecting a component and creating a typed relationship from it.

## Changes
- Added a contextual **Connect** action beside **Edit properties** in the selected-component context card.
- The action opens the Properties tab and scrolls directly to the typed relationship editor.
- Added a stable target ID and keyboard-focus styling for the relationship section.
- Kept relationship validation and creation on the existing controller/model path; this phase does not bypass endpoint-kind checks.
- Added responsive wrapping for the contextual action group.

## Verification
The focused regression suite should be run with the command in the project README or the established eight-file Workbench test command. Browser verification and production build are not claimed by this report.
