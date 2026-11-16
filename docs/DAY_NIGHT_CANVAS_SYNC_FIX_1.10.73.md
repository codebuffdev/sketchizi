# Sketchizi 1.10.73 — Day/Night canvas synchronization

## Intended behavior

- Day mode: Sketchizi chrome and Excalidraw's real `viewBackgroundColor` are `#ffffff`.
- Night mode: Sketchizi chrome and Excalidraw's real `viewBackgroundColor` are `#111722`.
- A legacy scene's previously saved `viewBackgroundColor` must not override the active global theme.
- Selecting a theme and then clicking the canvas must not cause the canvas background to revert.

## Implementation

1. `SketchiziCanvas.jsx` always supplies `initialData.appState.viewBackgroundColor` from the active Day/Night theme, overriding stale saved scene colors before initialization.
2. `canvasTheme.js` centralizes the actual Excalidraw API reconciliation and updates `viewBackgroundColor` with `CaptureUpdateAction.NEVER`.
3. `useSketchiziPreferences.js` schedules reconciliation after Excalidraw's theme and restoration update cycle.
4. `App.jsx` reconciles after `onChange` using the live API and live root theme rather than trusting a stale `appState` callback snapshot.
5. `styles.css` aligns the canvas region's fallback surface with the active theme.

## Verification

- `node --test tests/ui-defaults.test.js tests/community-gateway.test.js tests/auth-gateway.test.js`: 18 passed.
- ZIP integrity check: run by packaging workflow.
- Vite production build: not verified in this environment. `npm ci` could not complete because registry requests failed with DNS/network `EAI_AGAIN`. Run `npm ci` and `npm run build` in the target environment before deployment.
