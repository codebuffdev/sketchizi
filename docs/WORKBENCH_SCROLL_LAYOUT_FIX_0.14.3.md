# Workbench Scroll Layout Fix 0.14.3

## Problem
The Workbench panel used independent constrained-height scroll regions for Model Review, Experiments, Components, and Inspector. On narrow/tall panels this exposed several scrollbar tracks, made scrolling unpredictable, and separated related controls from their section context.

## Change
- Added one `.workbench-panel-scroll` wrapper around all active Workbench sections.
- Kept the panel header and document/model summary footer outside that wrapper so they remain visible.
- Removed section-level `overflow-y: auto` and viewport-based `max-height` constraints from Model Review, Experiments, Components, and Inspector.
- Made all sections content-height (`flex: 0 0 auto`) and visible-overflow so the single outer scroll region owns vertical scrolling.
- Kept the welcome branch inside the same scroll owner and explicitly overrides its old overflow setting.
- Added `tests/workbench-panel-layout.test.js` to assert the shared scroll wrapper and guard against inner scroll areas/height caps.

## Expected behavior
- The user scrolls the Workbench content once to move through Views, Model Review, Experiments, Components, and Inspector.
- Header and document/model summary footer stay visible.
- No separate scrollbar is shown for Experiments or Components.
- Browser page/canvas scrolling behavior is unchanged; the change is scoped to the Workbench panel.

## Verification
Executed successfully:
- `npm run test:workbench-ui` — 18 tests passed.
- `npm run test:simulation` — 46 tests passed.
- `npm run test:workbench-validation` — 24 tests passed.

The suites overlap, so these counts should not be summed as unique tests. The source ZIP excludes `node_modules`; production build and visual browser verification must be run in the recipient's local environment.
