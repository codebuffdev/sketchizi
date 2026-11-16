# Sketchizi 1.10.38 — Targeted Canvas Background Fix Report

## Changes

- `src/features/navigation/canvasBackgroundMode.js` — adds explicit `theme` / `custom` mode resolution. Legacy saved scenes without this new preference default to `custom` to avoid overwriting their restored background.
- `src/features/navigation/useSketchiziPreferences.js` — removes color-list inference. Theme-controlled mode synchronizes Excalidraw's actual `viewBackgroundColor` to `#ffffff` or `#121212`; custom mode is retained across theme changes and reloads. Adds a handler to return to the theme default.
- `src/features/navigation/useNativeSketchiziMenu.js` — marks a palette selection as custom at click time (including selecting the same color already in use) and adds a `Use theme default` action beside the palette when the palette controls can be identified.
- `src/App.jsx` — passes restored scene information and background actions into the existing preference/menu hooks.
- `src/styles/responsive-touch.css` — lets the dropdown wrapper avoid clipping and ensures the menu container owns vertical scrolling, including when the container is mounted outside the expected direct-child structure. Adds minimal styling for the return-to-default action.
- `tests/ui-defaults.test.js` — adds coverage for explicit mode resolution, removal of color-based inference, and the return-to-default menu action.

## Root causes

### Theme behavior

The previous code inferred automatic mode from a set of recognized hex colors. That cannot distinguish a deliberately selected color from an automatic default. The fix stores an explicit mode in `localStorage` under `sketchizi-canvas-background-mode` and does not compare colors to decide ownership. A legacy saved scene with no mode preference is treated as custom so its saved background is not silently replaced.

### Palette clipping

The menu includes Sketchizi-injected sections in Excalidraw's native dropdown. The CSS previously relied on a direct-child selector for the inner scroll container while also constraining the outer wrapper. The fix broadens the scroll-container rule and explicitly separates wrapper positioning from inner vertical scrolling. The exact clipping ancestor from the reported browser state could not be conclusively confirmed without running the app in a browser.

## Verification

- `node --test tests/ui-defaults.test.js tests/networking.test.js tests/architecture-catalog.test.js tests/chat-protocol.test.js`: **23 passed, 0 failed**.
- `npm run test:sync`: **22 passed, 0 failed**.
- `node --check` on the changed `.js` modules: passed.
- `npm run build`: **not successful** — `vite: not found` (exit code 127).
- Dependency installation was attempted with `npm install`; it timed out. Offline lockfile generation also failed because the Excalidraw package metadata is not cached (`ENOTCACHED`).
- Browser-based checks and generated production CSS inspection were **not performed** because dependencies could not be installed and the app could not be built. Chromium is present, but browser automation tooling is not installed.
- The supplied ZIP did not contain `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock`; no fabricated lockfile was added.

## Status

This is an intermediate source update, **not a release-ready build**. The automated tests above passed, but production build, browser theme checks, palette scrolling checks, and final runtime acceptance remain unverified due to the dependency-install limitation.
