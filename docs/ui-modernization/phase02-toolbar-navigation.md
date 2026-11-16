# UI Modernization 02 — Canvas Toolbar and Top Navigation

## Scope

Presentation-only refinements to the Sketchizi desktop application header, menu dropdowns, panel toggles, command search, collaboration action, and native Excalidraw canvas toolbar. Existing React command handlers and Excalidraw controls are retained.

## Design decisions

- Use the established premium/minimal palette and accent tokens.
- Use restrained borders, smaller shadows, consistent 9–14px radii, and stronger keyboard focus affordances from the existing header styles.
- Apply matching active/hover states in light and dark themes.
- Respect reduced-motion preferences.
- Keep the changes scoped to the existing header and canvas toolbar; do not hide or replace native canvas controls.

## Validation

Run `npm run test:ui-modernization` and `npm run test:all`. Then run `npm ci && npm run build` and visually inspect the editor at desktop and tablet widths in both themes. Production build and live browser appearance must be confirmed in the actual deployment environment.
