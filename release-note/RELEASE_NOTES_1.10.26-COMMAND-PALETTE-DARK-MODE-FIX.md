# Sketchizi 1.10.26 — Command Palette Dark-Mode Fix

## Root cause
The Sketchizi Command Palette is rendered through `createPortal(..., document.body)`, so its DOM is outside the `.app.theme-dark` element that owns Sketchizi's UI theme variables. The palette CSS therefore fell back to its light-mode fallback values such as `#fff`, `#fafafa`, and `#ddd` in dark mode.

## Fix
The existing `document.documentElement.dataset.sketchiziTheme` theme state is now used by a narrowly scoped dark-mode selector on the existing Command Palette container. The selector supplies the same Sketchizi dark-theme token values (`--ui-surface-solid`, `--ui-surface-soft`, `--ui-border`, `--ui-border-soft`, `--ui-text`, `--ui-text-muted`, `--ui-text-faint`, and `--ui-accent`) to the palette subtree and sets `color-scheme: dark` for native dark controls/scrolling.

No Command Palette component or command behavior was changed.
