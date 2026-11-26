# Responsive QA Automation Suite

Playwright suite that drives the real Sketchizi UI across 14 device viewports and
10 CSS breakpoint edges, runs automated layout-defect detectors at every
checkpoint, captures deterministic screenshots, and writes an HTML dashboard plus
a diffable JSON report.

It reuses the repo's existing Playwright install (`e2e/package.json`); nothing is
added to the root `package.json` dependencies or lockfile.

## Run

```bash
# one-time (same as the existing e2e suite)
npx --prefix e2e playwright install chromium

npm run test:responsive:smoke   # 4 viewports (375x812, 768x1024, 1440x900, 2560x1440) x 15 suites
npm run test:responsive:full    # 14 viewports x 15 suites + 10 breakpoint-edge checks (24 projects)
npm run test:responsive:discover   # which @media widths the CSS really uses
npm run test:responsive:contract   # fast, browser-free checks of the suite itself (also in test:all)
```

The dev server starts automatically on **127.0.0.1:5174** (the e2e suite uses 5173) and is shut
down afterwards. Output (git-ignored): `tests/responsive/artifacts/`

| File | Purpose |
|---|---|
| `responsive-report.html` | self-contained dashboard: heat-map (suite x viewport), filterable findings, screenshots |
| `responsive-results.json` | complete machine-readable results (schema v1) |
| `responsive-diffable.json` | timestamp-free projection for `git diff` / history |
| `screenshots/<viewport>/<suite>/<checkpoint>.png` | captured every checkpoint |

Compare two runs: `node tests/responsive/scripts/compare-results.mjs previous.json [latest.json]` (exit 1 if new findings).

## Severity and failing

| | meaning | default |
|---|---|---|
| P0 | control mostly off-screen / feature unusable | fails |
| P1 | horizontal overflow, clipped control, overlapping floating UI, dialog bigger than viewport, runtime exception | fails |
| P2 | touch target < 44x44, silently clipped text, console errors | reported |
| P3 | informational: coverage gaps, static `100vh` hints, exempted elements | reported |

`RESPONSIVE_FAIL_ON=none` makes the run report-only (recommended for the first run, to
get a baseline of existing defects), `P0|P1|P2|P3` sets the threshold.

## Environment variables

`RESPONSIVE_PROFILE` smoke|full - `RESPONSIVE_VIEWPORTS=375x812,1440x900` - `RESPONSIVE_EXTRA_BOUNDARIES=1`
(adds 640/641, 900/901, 1024/1025 found in the CSS) - `RESPONSIVE_FAIL_ON` - `RESPONSIVE_STRICT=1`
(unreachable features fail instead of being logged) - `RESPONSIVE_BASELINE=compare|update`
(pixel baselines in `tests/responsive/baselines/`, tracked in git) - `RESPONSIVE_EMBED_SCREENSHOTS=all|findings|none` -
`RESPONSIVE_FREEZE_ANIMATIONS=1` - `RESPONSIVE_SERVER=preview` (build + `vite preview`, more stable for
the full matrix) - `RESPONSIVE_PORT` - `RESPONSIVE_BASE_URL` (use a running server) - `RESPONSIVE_WORKERS`.

## Determinism

`reducedMotion: reduce`, light theme, fixed locale/timezone, service workers blocked, every non-local
origin aborted (fonts/analytics), `/api/**` served from fixtures (`helpers/network.js`: anonymous
auth by default, signed-in + mocked AI Ask JSON for the AI and collaboration suites, a 24-icon Eraser
catalogue), caret hidden, animations disabled in screenshots, fonts awaited.

## Detectors (`helpers/`)

`overflow.js`, `clipping.js`, `touch-targets.js`, `overlap.js`, `text-clipping.js`, `layout.js`
(dialog/panel fit, grid columns, `data-viewport` contract, `100vh` vs `100dvh`). They run inside the
page via one init script (`inpage.js`) and are invoked by `qa.checkpoint()`.

**Gotcha they handle:** under `isMobile` emulation Chromium inflates `window.innerWidth` to the content
width when content overflows, so `scrollWidth > innerWidth` silently passes. Detectors compare against the
viewport size Playwright configured (`run-detector.js`).

## Known limits (be aware when reading results)

* Headless Chromium has no collapsing URL bar or soft keyboard. `100vh` vs `100dvh` is therefore reported
  from a static scan of live stylesheets (P3, plus a P2 summary in the Pages suite) rather than reproduced;
  the "keyboard" tests shrink the viewport (fires `resize` + `visualViewport.resize`) which approximates
  but is not a real IME.
* `ArchitectureValidationPanel.jsx` is intentionally **not mounted** in `App.jsx` (asserted by
  `tests/canvas-first-header.test.js`), so suite J records that as a coverage gap and tests the validation
  surfaces that are reachable (Kubernetes Studio, Docker Compose Studio, Design validation dialog).
* Collaboration has no live WebSocket server in the suite: it lays out whatever surfaces appear and logs the
  rest as coverage gaps (`RESPONSIVE_STRICT=1` turns gaps into failures).
* Selectors live in `config/selectors.js`; `npm run test:responsive:contract` fails when one disappears from `src/`.
