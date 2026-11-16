# STUDIO-002 — Compose document preservation (first vertical slice)

This is the first scoped implementation toward bidirectional YAML editing. It does **not** claim complete YAML AST or canvas round-trip preservation.

## Changes
- `createComposeDocument` deep-clones the input and normalizes the established `name`, `services`, `volumes`, and `networks` keys, retaining `secrets`, `configs`, `x-*` extensions, and other top-level mappings.
- `exportComposeYaml` serializes the retained document rather than a hardcoded subset.
- Validation now sees declared secrets/configs in the normalized document, preventing false missing-reference diagnostics.
- Added focused regression tests for nested cloning, edit/export preservation, extensions, and empty extension mappings.

## Limits and follow-ups
- Export remains a re-serialization; original comments, anchors, scalar style, and exact whitespace are **not** guaranteed to survive.
- No changes to Kubernetes Studio, diagram identity mapping, UI revision tracking, or conflict resolution.
- Full bidirectional editing requires a separate AST-aware preservation contract, canvas change propagation, and browser tests.
- No changes to Docker execution permissions or live integration.

## Verification
Run `npm ci`, `node --test tests/studio-002-compose-document-preservation.test.js`, `npm run test:docker-compose`, `npm run test:all`, and `npm run build`. GitHub Actions results should be reviewed before merge.
