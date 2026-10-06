# Sketchizi 1.1.0 — Modern Excalidraw Integration

## 1.1.0 smoke-test fixes

This build addresses the first UI smoke-test findings:

- Smoother native Excalidraw toolbar by preventing Sketchizi's global focus ring from styling Excalidraw controls.
- Dark mode now synchronizes the Excalidraw canvas background with the editor theme while preserving custom canvas colors.
- Theme changes are forwarded to Excalidraw through `onThemeChange`.
- Icon-library drag/drop placement now uses Excalidraw's official `viewportCoordsToSceneCoords()` utility, so placement follows zoom/pan correctly.
- Eraser SVG icons are fetched and converted to data URLs before being registered with Excalidraw, making canvas insertion reliable and allowing the image file to persist with the scene.
- Properties panel appearance controls were redesigned around the modern Excalidraw style workflow: stroke palette, background palette, fill style, stroke width, pressure for freedraw, line style, roughness and opacity.

## Verification status

Source-level validation completed. A full `npm install` / production build could not be completed in this environment because dependency installation timed out. Run `npm install && npm run build` locally before release.


### Smoke-test drag fix
- Fixed native desktop icon dragging being suppressed by the icon card CSS (`-webkit-user-drag: none`).
- Removed the desktop pointer-down `preventDefault()` / pointer capture path so the browser can emit native `dragstart`.
- Touch dragging remains handled by the intentional long-press pointer path.
