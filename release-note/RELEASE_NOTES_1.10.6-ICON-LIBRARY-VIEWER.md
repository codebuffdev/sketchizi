# Sketchizi 1.10.6 — Hide Icon Library from Viewer

## Change

The existing collaboration edit capability is now the visibility gate for the Sketchizi Icon Library entry point.

- Host/local editing sessions and approved Editors continue to render the existing Icon Library button and panel.
- Viewers do not render the Icon Library button.
- Viewers do not render the Icon Library panel, including during a permission transition.
- The existing `/` keyboard shortcut no longer opens the Icon Library for Viewers.

## Entry-point audit

The current source contains two intentional Icon Library entry points:

1. The top-left `library-toggle` button in `src/App.jsx`.
2. The `/` keyboard shortcut in `src/features/navigation/useSketchiziPreferences.js`.

No Icon Library trigger was found in `useNativeSketchiziMenu.js`, More Tools, collaboration UI, Properties, or the shortcut dialog.

## Scope

The collaboration permission model itself is unchanged. The existing `collaborationCanEdit` value remains the source used for editing capability/UI gating. Icon Library implementation, insertion behavior, Layout, collaboration synchronization, undo/redo, file management, and canvas behavior are unchanged.
