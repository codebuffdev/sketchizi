# Phase 15 — Architecture Decision Records

## Scope

Adds a lightweight Architecture Decision Record (ADR) section to the existing Architecture Validation panel. Users can document the title, status, context, decision, consequences/trade-offs, alternatives and related component IDs. Records are stored locally in the current browser using a namespaced localStorage key and can be exported as versioned JSON.

## Data and safety

- This feature is local-only; it does not send records to a server.
- The record store is capped at 100 entries and individual text fields are capped at 4,000 characters (title 160 characters).
- Malformed storage is handled without crashing the review panel.
- Statuses are `proposed`, `accepted`, `rejected`, and `superseded`.
- Export schema is version 1.
- “Edit copy” loads an existing record into the form; saving creates a new record rather than mutating the original, preserving an audit-friendly history.

## Verification

- `npm run test:all`: 428 passed, 0 failed.
- `npm run test:system-design-decisions`: 5 passed, 0 failed.
- `npm run test:package-lock-consistency`: 6 passed, 0 failed.
- `npm run build`: blocked during prebuild because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent. Install dependencies with `npm ci` in an environment with registry access, then rerun the build. No successful production build is claimed.

## Files changed

- `src/features/architecture/systemDesignDecisionRecords.js` — validation, safe storage and export helpers.
- `src/components/app/ArchitectureValidationPanel.jsx` — ADR form, record list, local persistence and export.
- `src/styles/architecture-validation.css` — responsive ADR presentation.
- `tests/system-design-decision-records.test.js` — unit tests.
- `package.json` — focused test script.
- `docs/design-studio/phase15-architecture-decision-records.md` — implementation notes and verification.
