# Sketchizi 1.10.25 — Details Dark-Mode Fix

## Scope
Focused dark-mode visual fix for the HOST collaboration status bar.

## Root cause
The desktop collaboration-status CSS assigns the Details button a light
`var(--sketchizi-desktop-surface)` background. The existing dark-mode selector
for `.collaboration-status-link` overrode only the border and text color, not
the background, so the later desktop rule left the button with a white
background in dark mode.

## Fix
The dark-mode `.collaboration-status-link` rule now explicitly uses
`background: transparent`, matching the existing dark-mode Share control and
preventing the light desktop surface from leaking into dark mode.

No collaboration logic, handlers, state, permissions, lifecycle, WebSocket
code, participant handling, or toolbar code was changed.
