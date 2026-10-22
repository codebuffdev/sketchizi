# Breakscale-Inspired Workbench Redesign — Phase 11

## Scope

Make typed relationship connectors visually distinguishable by their semantic kind while keeping the persisted Workbench relation as the source of truth.

## Changes

- Added a centralized `relationVisualStyle(kind)` helper with a restrained semantic color palette.
- Newly created typed relationship arrows receive the color, width, and arrowhead style associated with their relation kind.
- Existing ordinary arrows promoted to typed relationships receive the same semantic style while retaining bindings and unrelated `customData`.
- Unknown relation kinds use the neutral dependency style rather than failing.
- Added tests for style differentiation and metadata preservation.

## Verification

- Focused regression suite: 94 passed, 0 failed across 13 test files.
- Production build: not run; `node_modules` is not present in this extracted source bundle.
- Browser verification: not run.
- Package version remains unchanged at 1.10.86.

## Suggested commit

`feat(workbench): distinguish typed relationship connectors visually`
