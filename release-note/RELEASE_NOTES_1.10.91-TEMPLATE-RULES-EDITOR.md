# Sketchizi 1.10.91 — Personal Template Rules Editor

## Added
- Dedicated Edit Personal Template Rules dialog accessible from the command palette.
- Configure required component roles, allowed directed relationships, and default guided/strict mode for a personal template.
- Template rule changes persist in browser storage and travel with template JSON export/import.
- New designs selected from a personal template initialize the rule-mode choice from that template's saved default.

## Compatibility
- No changes to the `.sketchizi` or `.excalidraw` format.
- Existing personal templates without rule fields remain valid and default to no required roles, no connection restrictions, and guided mode.

## Verification
- Design framework and personal template store tests: 13 passed.
- Production build not verified: dependency installation timed out in the build environment.
