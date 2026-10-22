# Workbench Phase 10 — Persist Narrow Workspace Selection

## Change
The narrow-desktop Palette / Canvas / Engineering / Inspector selection is now restored from and saved to local storage. Invalid stored values fall back to Engineering. Storage access is guarded so unavailable browser storage does not prevent the application from rendering.

## Scope and compatibility
- Presentation preference only; no engineering-model or document-schema changes.
- Package version remains 1.10.86.
- Existing narrow-desktop breakpoints and panel behavior are unchanged.

## Verification
Run focused workspace and layout tests. Production build and browser visual verification must be recorded separately and are not claimed by this report unless executed in this environment.
