# Sketchizi 1.10.38 — Canvas Background Menu Scroll-Limit Fix

## Scope

This change only targets the native Excalidraw dropdown's scroll limit. The explicit automatic/custom canvas-background mode and `Use theme default` behavior from the supplied ZIP are preserved.

## Root cause identified from source

The dropdown scroll area was constrained by viewport formulas that assumed a fixed menu/header offset. In particular, the desktop/tablet media rule capped `.dropdown-menu-container` using the guessed `--sketchizi-responsive-header-height`, while the menu is positioned by Excalidraw and its actual top edge can vary. The outer `.dropdown-menu` also had its own independent viewport-relative max-height. These independent caps could disagree with the actual space available below the positioned menu, allowing the menu wrapper/scroll area to clip the final inserted/native content.

The correct available height is based on the rendered scroll container's actual `getBoundingClientRect().top`, not a guessed header height.

## Changes

- `src/features/navigation/useNativeSketchiziMenu.js`
  - Measures the actual Canvas-background dropdown scroll container after Excalidraw positions and populates it.
  - Calculates available height from `window.innerHeight - actualTop - bottomGap`.
  - Removes the outer dropdown's independent max-height cap and explicitly keeps the inner menu container as the sole vertical scroll owner.
  - Recalculates on DOM changes, window resize, and visual viewport resize.
- `src/styles/responsive-touch.css`
  - Removes the desktop/tablet max-height override based on an assumed header offset. The CSS remains a fallback; runtime sizing uses the measured position.
- `tests/ui-defaults.test.js`
  - Adds regression assertions that sizing uses the actual rendered top edge and responds to viewport resizing.

## Test results

Passed:
- `node --test tests/ui-defaults.test.js` — 6 passed.
- `node --test tests/networking.test.js` — 4 passed.
- `node --test tests/architecture-catalog.test.js` — 3 passed.
- `node --test tests/chat-protocol.test.js` — 10 passed.
- `node --import ./tests/register-sync-test-loader.mjs --test tests/collaboration-sync-characterization.test.js tests/collaboration-sync-core.test.js tests/sync-diagnostics.test.js` — 22 passed.

Total: 45 tests passed, 0 failed.

## Production build and browser verification

- `npm run build` was attempted and failed with exit code 127: `sh: 1: vite: not found`.
- Dependency installation was attempted but timed out in this environment. The supplied project has no package lockfile, so no lockfile was fabricated and dependency versions were not changed.
- Browser verification against the running Sketchizi application was not performed because dependencies could not be installed and the app could not be built. The short-viewport acceptance criterion therefore remains unverified in a real browser.

## Limitation

This is a targeted source-level fix with regression coverage, not a release-ready verification claim. Confirm in the browser at the reported short viewport that the final swatch row is visible at the true bottom of the menu before releasing.
