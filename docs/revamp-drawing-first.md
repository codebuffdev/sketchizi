# Sketchizi revamp — drawing first

Status: staged implementation proposal · November 2026

**Direction:** Sketchizi remains an all-purpose drawing tool competing with Excalidraw. Architecture and DevOps are optional, advanced workflows—not the product's primary identity.

## Verified repository baseline

- Frontend: React 18, Vite 5, Excalidraw 0.18 prerelease; local/cloud persistence, templates, icon libraries, collaboration and engineering studios.
- Backend: unified Spring Boot 3.5 / Java 17 service for authentication, AI, cloud workspace and collaboration. The current README documents in-memory collaboration room state.
- Drawing repository: currently contains one Excalidraw drawing file, not a separate executable frontend.
- A recent frontend GitHub workflow had 17 failing UI contract tests and skipped its build step. These need triage before calling the release gate healthy.

## Product rules

1. A blank, fast drawing canvas is the default. A user must be able to draw and export without signing in.
2. Prefer Excalidraw-native editing, selection, grid, snapping and viewport behavior.
3. Surface advanced tools only after the user asks for them. Never automatically open secondary panels.
4. Protect local/cloud user data and preserve existing file formats.
5. Every menu and dialog needs keyboard, touch and accessible focus behavior.
6. Make changes in reviewed phases rather than a risky one-shot rewrite.

## Staged roadmap

| Phase | Goal | Acceptance gate |
| --- | --- | --- |
| 0 — Reliability | Triage existing CI failures, establish build + preview smoke checks | Reliable test/build baseline |
| 1 — Canvas-first creation | One Create menu, blank drawing first, templates second, optional studios later | Creation flows and keyboard navigation tested |
| 2 — Drawing quality | Guide consistency, selection, grid, zoom, text, arrows and pointer gestures | Playwright interaction and visual regression tests |
| 3 — File lifecycle | Simplify local/cloud save, import, export and recovery | No silent data loss, save-conflict tests |
| 4 — UI consistency | Consolidate redundant menus/toolbars and improve responsive layout | Usability and accessibility checks |
| 5 — Performance | Profile initial bundle, icons and large diagrams | Recorded baseline and measurable improvement |
| 6 — Power-user tools | Improve entry/exit for Kubernetes, Compose, AI and validation | Existing workflows still work |
| 7 — Collaboration | Recovery, room authorization, concurrent edits, persistence | Browser and backend integration coverage |

## Implemented in phase 1 branch

- Extract a reusable Create menu from App.jsx, reducing its transient navigation state.
- Blank drawing uses the existing createNewFile flow with unsaved-work confirmation.
- Templates appear next; engineering studios have a secondary section.
- Cloud Workspace remains available; no specialized feature is removed.
- Escape, outside click and arrow/home/end keyboard menu handling are localized to the menu.
- Add responsive styling and source-level regression checks.

## Next tasks

- Resolve the legacy UI-test contract failures without disguising actual regressions.
- Add browser tests for new blank drawing, template creation, Escape/outside-click and unsaved-change confirmation.
- Trace App.jsx document/overlay state ownership and gradually extract focused controllers.
- Measure large diagram latency and avoid premature rewrites.
- Review changes on a feature branch; do not merge the revamp automatically.

## Explicit non-goals

- Becoming an architecture-only product.
- Replacing the Excalidraw rendering engine.
- Removing drawing tools, icons, local files, or exports.
- Changing backend deployment or persistent document formats in this phase.