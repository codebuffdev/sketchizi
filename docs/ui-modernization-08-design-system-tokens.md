# UI Modernization 08 — Design System Consolidation

## Purpose

Centralize recurring UI decisions into semantic design tokens so future refinements can be made consistently without accumulating one-off CSS values. This is a presentation-only change; it does not alter editor behavior or component state.

## Token groups

- **Color:** brand accent, page/surface layers, borders, text hierarchy, focus color, and theme-specific semantic aliases.
- **Geometry:** shared control, card, dialog, and pill radii.
- **Spacing:** a compact 4px-based scale.
- **Elevation:** hairline, panel, hover-card, and popover shadows.
- **Motion:** fast/standard/slow durations and a standard easing curve; reduced-motion preference sets durations to zero.
- **Touch:** minimum target sizing token for coarse-pointer layouts.

## Usage

Use `--sk-color-*`, `--sk-radius-*`, `--sk-space-*`, `--sk-shadow-*`, and `--sk-motion-*` for new styles. Theme-aware components should prefer semantic aliases such as `--ui-surface`, `--ui-border`, `--ui-text-strong`, and `--ui-accent` instead of hard-coded colors. Existing legacy aliases (`--sk-ui-*`) remain available to avoid changing older selectors in one sweep.

## Theme behavior

`.app.theme-light` and `.app.theme-dark` provide semantic values. Light-theme values preserve the existing palette; dark-theme tokens map to the current charcoal surfaces and soft violet accent. Global primitive values remain available for styles outside the app root.

## Guardrails

- Do not remove legacy aliases until all consumers have been migrated.
- Avoid changing component markup or interaction handlers as part of token work.
- Respect `prefers-reduced-motion` and forced-colors behavior.
- Verify light/dark contrast and focus rings in a real browser before release.
