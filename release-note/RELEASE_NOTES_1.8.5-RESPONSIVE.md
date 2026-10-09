# Sketchizi 1.8.5 — Responsive Shell

## What changed

- Added a final responsive shell strategy for desktop, tablet, mobile, and narrow-mobile layouts.
- Changed the application shell from `100vw/100vh` to the containing `100%` dimensions and disabled accidental document-level scrolling.
- Separated Sketchizi-owned collaboration UI from Excalidraw's mobile bottom toolbar instead of allowing both to occupy the same bottom-center lane.
- On mobile widths (`<= 760px`), the collaboration status moves to a dedicated top status lane.
- On narrow mobile (`<= 520px`), collaboration actions stack into a two-row layout while retaining Details and the role-specific lifecycle action.
- At very narrow widths (`<= 390px`), collaboration actions stack vertically for reliable tap targets.
- The minimap and its toggle reserve the Excalidraw mobile bottom-toolbar lane instead of competing with it.
- Library, Properties, and Layout popovers are constrained to the viewport and internally scroll when necessary.
- Desktop/tablet collaboration remains in the bottom-center area where there is enough space.
- Excalidraw's internal toolbar implementation was not rewritten; the responsive layer works around its existing desktop/mobile layout behavior.

## Collaboration behavior

The collaboration lifecycle implementation from 1.8.3/1.8.4 is preserved. This release only changes spatial arrangement of the existing status UI.

## Verification

Static checks were performed on the changed CSS/package metadata. Full browser runtime verification could not be completed in this environment because project npm dependencies could not be installed (external npm registry DNS/network access is unavailable).
