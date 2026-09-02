# Sketchizi v1.0.20 — Properties Menu Polish

This version keeps the existing Sketchizi canvas, persistence, Eraser icon library, and responsive layout while polishing the native Excalidraw menu.

### Menu improvements
- Properties settings are presented as a compact native-menu section.
- `Auto-open on selection` uses a proper switch instead of an unstyled browser button.
- The setting is persisted locally.
- Theme selection remains a clean segmented control.
- Existing GitHub-only community link remains unchanged.

### Behavior
- Auto-open is **off by default** so selecting an object no longer unexpectedly opens the Properties panel.
- Users can enable it from the menu when they want automatic Properties opening.


## Properties visibility
- When **Auto-open on selection** is OFF, the Properties canvas button and panel are completely hidden.
- The `P` shortcut only opens Properties when Auto-open on selection is enabled.
- Turning the setting OFF immediately closes any open Properties panel.


## v1.0.19 — Storage-limit handling

IndexedDB save failures are surfaced instead of being silently ignored. When IndexedDB cannot persist a sketch, Sketchizi attempts an emergency localStorage snapshot and offers Retry save and Download backup actions.


## v1.0.20
- Added confirmation before the native Reset the canvas action.
- Confirmed reset clears both the visible canvas and its persistent local copy.
## v1.0.21 — Tablet / Touch Polish
- Improved touch target sizes across custom controls and properties.
- Added touch-friendly internal scrolling and overscroll containment for Library, Properties, and Layout panels.
- Improved tablet portrait/landscape panel sizing and safe-area handling.
- Prevented accidental page/app zoom from repeated control taps on coarse-pointer devices.

