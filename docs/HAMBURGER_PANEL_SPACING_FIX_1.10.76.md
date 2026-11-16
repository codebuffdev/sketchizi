# Sketchizi 1.10.76 — Hamburger panel spacing fix

## Change

Removed the empty separator/spacer elements that remained after the native `Reset the canvas` action once the independent Canvas background row was removed. The cleanup only trims empty/decorative siblings after the final visible action and clears the final action group's trailing border/spacing. Visible menu actions and their handlers are preserved.

## Validation

- `node --check src/features/navigation/useNativeSketchiziMenu.js`: passed
- `node --test tests/ui-defaults.test.js tests/community-gateway.test.js tests/auth-gateway.test.js`: 19 passed, 0 failed
- `npm run build`: not verified; dependency installation stalled and Vite was unavailable (`vite: not found`).
