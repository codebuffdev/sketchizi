# Sketchizi 1.10.45 — Theme default canvas background fix

- Treat legacy `#ffffff` / `#fff` canvas backgrounds as the default theme background when they were incorrectly marked as custom.
- Switching from Light to Dark now migrates the standard white canvas to theme-following mode and applies `#121212`.
- The “Use theme default” action persists theme-following mode and immediately applies the effective light/dark canvas color.
- Preserves non-default custom canvas colors and leaves canvas persistence internals unchanged.
