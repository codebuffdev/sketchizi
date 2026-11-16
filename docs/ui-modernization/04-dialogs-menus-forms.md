# UI Modernization 04 — Dialogs, Menus, Forms, and Feedback

This pass extends the premium/minimal UI tokens to dialogs, confirmation surfaces, authentication and collaboration dialogs, dropdowns, popovers, and form focus states.

## Scope and behavior

- CSS-only visual overrides; React handlers and state are unchanged.
- Adds restrained backdrop blur, consistent borders/radii, softer elevation, and clearer keyboard focus.
- Provides light/dark surface treatments and small-screen dialog sizing.
- Respects reduced-motion preferences.
- Workbench remains removed.

## Verification

Run `npm run test:ui-modernization` and `npm run test:all`. Run `npm ci && npm run build` in an environment with registry access to verify the production bundle. Perform a browser check of authentication, confirmation, collaboration, and dropdown flows in both themes.
