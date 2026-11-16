# UI Modernization 05 — Feedback, Loading, and Empty States

This pass extends the shared premium/minimal visual layer to existing notice, collaboration status, progress, and empty-state elements. It is presentation-only: it does not add new notification state, alter asynchronous operations, or change persistence behavior.

## Scope

- Normalize borders, corner radii, and elevation for existing notices and status banners.
- Make empty states visually distinct while retaining their existing content and actions.
- Align loading indicators and progress elements with the shared accent color.
- Include dark-theme, narrow viewport, and reduced-motion adjustments.

## Validation

Run `npm run test:ui-modernization-feedback` and `npm run test:ui-modernization`. A production build and visual browser check should also be performed in an environment with dependencies installed.
