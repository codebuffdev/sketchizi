# Dock keyboard shortcuts

Single source of truth: `src/features/commands/keyboardShortcutRegistry.js`.
The dock installs **one** capture-phase `keydown` listener (`PrimaryDock.jsx`); a shortcut runs the same
`rememberChild` + `runChild` path as a mouse click, so tool presets, highlighter save/restore and slot memory behave identically.

**Convention:** primary tool = plain letter. Every sub-tool = **Alt+Shift+key** (⌥⇧ on macOS, matched on the physical key).
Ctrl/Cmd is not used for tools (reload, new tab, print, find are the browser's). Shortcuts are ignored while typing in
inputs/textareas/contenteditable/dialogs, during canvas text editing, on key auto-repeat, and with Ctrl/Cmd held.

## Primary
| Key | Tool | Handled by |
|---|---|---|
| V | Select | dock |
| H | Hand Pan | dock |
| R | Shapes (Rectangle) | dock |
| A | Arrow | dock |
| P | Pen (Fine Pencil) | dock |
| T | Text | dock |
| I | Image | dock |
| E | Eraser | dock |
| C | Code Block (see notes) | CodeBlockLayer |
| L | Line | dock |
| O / B / K | Ellipse / Bucket Fill / Laser (legacy hints) | Excalidraw |

## Sub-dock (Alt+Shift+…)
Select: **V** Select, **H** Lasso · Shapes: **R** Rectangle, **U** Rounded Rectangle, **O** Ellipse, **D** Diamond, **G** Triangle,
**X** Hexagon, **Y** Cylinder, **N** Funnel, **W** Bucket Fill · Arrow: **A** Arrow, **Q** Double, **C** Curved, **J** Elbow,
**S** Dashed, **L** Line · Pen: **P** Fine Pencil, **M** Highlighter · Text: **T** Text Block, **K** Sticky Note, **B** Code Block ·
Image: **I** Upload Image, **F** Frame · Eraser: **E** Eraser, **1** Laser Pointer.
(Alt+Shift+Z is unused on purpose: Alt+Z is Zen mode.)

## Notes
* Plain `L` selects Line (was Todo List). Todo List no longer has a keyboard shortcut.
* Properties toggle moved from `P` to `Shift+P` because `P` is Pen.
* "Smart Flow Connector" does not exist in the dock, so `C` stays with Code Block. Reassign when that tool ships.
* The spec's Box Marquee, Pill, Calligraphy Brush, Speech Callout, Half-Filled Circle and Area Eraser are not dock tools today;
  Pill/Circle/Straight Arrow/Straight Line/Stroke Eraser map to Rounded Rectangle/Ellipse/Arrow/Line/Eraser.
* Adding a tool: add its id to `SUB` in the registry; `tests/keyboard-shortcuts.test.js` fails until it has a unique chord.
