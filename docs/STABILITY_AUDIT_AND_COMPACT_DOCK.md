# Stability audit (items 4–6) and compact tool dock

## Environment limits (read first)
The sandbox had **no network and no `node_modules`**. Therefore: `npm run build`, lint, and **all browser smoke tests were NOT run**. Only the Node test suite (`node --test`, no external packages) could be executed. Nothing below claims browser verification.

## Test results
| | Tests | Pass | Fail |
|---|---|---|---|
| Baseline (before) | 1117 | 1035 | 82 |
| After | 1124 | 1049 | 75 |

No test that passed before fails now. The 75 remaining failures are pre-existing:
- 59 are regex assertions against exact source text of files that were later refactored (e.g. `App.jsx`, `ToolOptionsDock.jsx`, header/dock enhancers). They need behavior-level rewrites that require a DOM/browser harness; not rewritten here.
- 11 need packages missing in the sandbox (`yaml`, from `npm ci`): Kubernetes studio, Docker Compose, Studio-002/004 suites.
- 5 are index-order/count based source checks (Create menu order, header order, choice-menu `createPortal` count, Zen-mode `initialData` slice).
They were not suppressed or weakened.

## Item 4 – brittle tests
Converted to behavior tests (same intent, no source-string matching):
- `todo-task-state` legacy-completed test -> exercises `todoModel` (`isTaskCompleted`, `summarizeTasks`, `setTaskChecked`).
- `page-canvas`: default page size test now compares to `DEFAULT_PAGE_SIZE` (the product intentionally uses a 55:27 page, 1600x785; the test hard-coded 1400). Page-fit test updated to the current contract of `getPageFitViewport` (zoom is an absolute target; page stays centred; invalid input -> null).
- `free-draw-stroke-width`: replaced a regex counting `getAdjustedFreeDrawStrokeWidth(appState)` calls with a test that dock patches keep numeric width and key consistent.
- `icon-library-layout`: no longer pins a hex colour; checks the theme token is defined and consumed.
- `primary-dock-selection-focus`: failure was real (dead prop) – see below.
- `canvas-tab-identity`: removed a stale duplicate of the passing `stability-tab-creation` Ctrl+N auto-repeat test.

## Item 5 – Icon Library
No test in `tests/` expects `height: 455px`; 455px is the height set by the last centring rule in `icon-library-redesign.css`, which is inside the smoke budget (<=462). The actual violation is the **width**: that same rule set 390px, and the phone rule set 390px x 72dvh, versus the compact 320x460 contract in `icon-panel-compact.css`, `icon-library-compact/layout` tests and `scripts/browser-smoke.mjs` (width <= 322, height <= 462). Two stylesheets fought; the more specific `!important` rule in the redesign file won.
Fix: both overriding rules in `src/styles/icon-library-redesign.css` now use 320 x 460 (viewport-bounded). New `tests/icon-library-size-budget.test.js` fails on the old values ("desktop panel width 390px exceeds 322px") and passes now. Not confirmed in a real browser.
(The older top-right 390x650 rule near line 1330 is overridden by the later centring rule; left untouched.)

## Item 6 – verification
Workspace restoration, cloud-file loading, cloud recovery actions: covered only by the existing Node tests (all passing except two stale regex checks, "cloud canvas rename…" and "Save to Cloud…"). **Not browser-verified.**
Existing patches in `stability-audit-patches/` were not re-applied.

## Bugs fixed
- `src/components/app/SketchiziCanvas.jsx`: removed `selectedElements` passed to `PrimaryDock`, which never uses it (dock must be independent of selection).
- `src/styles/icon-library-redesign.css`: Icon Library oversize (above).

## Part 2 – compact dock
Files: `src/components/app/PrimaryDock.jsx` (markup unchanged, all 16 tools kept), `src/styles/ipad-radial-tool-wheel.css` (all styling).

| Metric | Before | After (desktop) | Touch / iPad (`pointer: coarse`) | Phone (<=600px) |
|---|---|---|---|---|
| Width | 56px | 44px | 52px | 40px |
| Button | 42x38 | 34x32 | 38x36 | 32x30 |
| Icon | 22px | 19px | 20px | 18px |
| Gap | 2px | 1px | 2px | 1px |
| Padding | 8/7 | 5/4 | 5/4 | 4/3 |
| Radius | 22px | 14px | 14px | 12px |
| Left offset | 26px | 16px | 12px | 8px |
| Height (16 tools) | ~670px | ~548px | ~626px (approx.) | ~532px (approx.) |

Overlap: `max-height = 100dvh - 2*(header height + 8px)` on the vertically centred rail, so it cannot reach the header/hamburger; it scrolls if the viewport is short. The existing hide-while-menu-open behavior is unchanged. Selected state keeps the dark filled button. Sizes derive from CSS custom properties, tested by `tests/primary-dock-compact-layout.test.js`. Tool selection and canvas interaction were **not** exercised in a browser.

## Outstanding
- Run `npm ci`, `npm run build`, `node scripts/browser-smoke.mjs`, and eyeball the dock at desktop and iPad widths.
- 59 stale regex tests still need behavior rewrites; 11 need dependencies installed.
- Nothing merged or pushed.
