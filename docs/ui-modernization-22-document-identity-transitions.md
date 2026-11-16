# UI Modernization 22 — Document Identity & Safer Transitions

## Scope

This phase makes the current working document easier to identify and warns before a document switch can replace a browser-local canvas or edits that have not been written back to the associated file. It keeps Sketchizi's current local autosave, recovery, File System Access API, and download fallback models intact.

## User-facing changes

- The header displays the active document name, truncates long names, and gives the full name and storage context in its accessible label and hover title.
- The header distinguishes a file handle association (`Linked file`), browser-local canvas (`Local canvas`), and edits not yet written to the source file (`Changes not saved to file`).
- The dirty marker is based on a compact content hash of live scene elements and a baseline captured when a document is opened or successfully saved to its associated file. Viewport movement and selection state do not mark the document dirty because app state is excluded.
- The document name and compact baseline persist locally so the document identity and unsaved-to-file indicator can be restored on reload, including browsers that save via download fallback. The hash is only for UI state comparison, not security or file integrity.
- Opening another drawing or creating a new drawing asks for confirmation if the current canvas has no associated file or the current scene differs from the last file-backed baseline.
- The confirmation explains the distinction between browser-local autosave and writing changes to the original file, and recommends saving/exporting or downloading a recovery backup before proceeding.
- Cancelling a transition preserves the current canvas. Confirmations occur after a target file has been selected/read where possible, so canceling the file picker does not first interrupt the current work.

## Behavior details

- A clean drawing associated with a file can be replaced without an extra prompt; its original file remains available.
- A changed, file-associated drawing prompts before replacement because local autosave does not update the original file.
- A populated browser-local canvas without a file association prompts before replacement because opening/creating another drawing changes the active local canvas copy.
- All existing native edit handlers, file pickers, recent-file APIs, serialization, and recovery mechanisms remain in use.

## Verification

Run `npm run test:ui-modernization`. This phase includes source-contract tests for document identity, file-backed dirty tracking, replacement guards, and responsive styles. A production build and live-browser visual check are still required after dependencies and Excalidraw font assets are installed.
