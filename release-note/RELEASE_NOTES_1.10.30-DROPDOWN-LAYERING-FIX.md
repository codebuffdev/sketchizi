# Sketchizi 1.10.30 — Dropdown Layering Fix

## Root cause

The application header has an established stacking context:

- `.desktop-app-header` uses `position: relative` and `z-index: 500`.
- `.desktop-app-dropdown` is absolutely positioned below the corresponding menu button.
- The desktop canvas lives in the following workspace row and does not supersede the header's stacking context.

The regression came from the 1.10.29 responsive coordination layer. At `min-width: 1025px`, the final responsive rule set:

```css
.desktop-app-header {
  min-width: 0;
  overflow: hidden;
}
```

That overflow rule clipped the absolutely positioned header dropdown to the 58px header box. The dropdown was therefore opened correctly but its content was visually cut off behind/below the header, producing the reported symptom.

## Fix

Changed only that presentation rule in `src/styles/responsive-final.css`:

```css
.desktop-app-header {
  min-width: 0;
  overflow: visible;
}
```

No z-index escalation was required. No canvas layering, menu markup, handlers, or menu logic were changed.

## Scope

The following remain unchanged:

- File / Edit / View / Arrange / Help menu definitions
- menu click handlers
- command registry
- keyboard shortcuts
- collaboration
- WebSocket behavior
- Excalidraw
- toolbar
- theme logic
- responsive breakpoints
- Properties
- Icon Library
- Minimap
- Export
- Validation

## Validation

Static source inspection confirms the header remains at `z-index: 500` and the canvas remains in the workspace below it. The dropdown is now no longer clipped by the header at large-desktop widths.

No browser runtime validation was possible because project dependencies were unavailable in the environment.

## Build

`npm install --no-audit --no-fund` was attempted. Installation timed out after 300 seconds.

`npm run build` therefore could not execute successfully because Vite was unavailable (`vite: not found`, exit status 127).

## Changed files

- `src/styles/responsive-final.css`
- `package.json`
- `index.html`
- `RELEASE_NOTES_1.10.30-DROPDOWN-LAYERING-FIX.md`
