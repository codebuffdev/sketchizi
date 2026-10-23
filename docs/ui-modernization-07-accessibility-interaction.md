# UI Modernization 07 — Accessibility and interaction polish

This pass improves the keyboard and system-preference experience without changing application handlers or editor behavior.

## Included

- A high-visibility `:focus-visible` ring for interactive controls, with a two-layer treatment that works on light and dark surfaces.
- Keyboard focus is not shown for pointer-only interaction where the browser supports `:focus-visible`.
- Forced-colors support uses system highlight colors rather than relying on Sketchizi's accent palette.
- Reduced-motion rules suppress nonessential transitions and animations in Sketchizi chrome.
- Text selection and disabled controls receive clearer visual feedback.
- Interactive controls keep a minimum 40px target where layout permits; existing Excalidraw scene controls are not forcibly resized.

## Verification

Run `npm run test:all` and `npm run check:package-lock-consistency`. A live keyboard pass should also verify Tab/Shift+Tab order, Escape behavior in dialogs, and focus return after closing overlays. CSS contract tests do not replace that manual/browser verification.
