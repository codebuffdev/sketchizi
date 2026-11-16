# STUDIO-003 — Shared validation diagnostics (first slice)

## Goal
Unify the **presentation contract** for validation findings from Docker Compose Studio and Kubernetes Studio without rewriting existing domain-specific validation rules.

## Included
- `src/features/studio-validation/diagnostics.js`: normalized severity, code, resource, path, remediation and deterministic ordering.
- `tests/studio-003-validation-diagnostics.test.js`: characterization against actual Compose and Kubernetes validators; immutability and summary checks.

## Deliberately excluded
- No replacement of the existing validation engines.
- No UI integration, automatic fixes, remote schema fetching or deployment blocking policy changes.
- No modifications to main or live environment integrations.

## Follow-up tasks
1. Adopt shared diagnostics in both studio UI panels with accessible severity and resource navigation.
2. Define structured rule IDs for Kubernetes (currently most rules emit message-based IDs); remove index fallback only when rules expose stable identities.
3. Add safe remediation previews and explicit user confirmation.
4. Add JSON-schema and version-aware validation with offline fallback.
5. Add browser interaction tests for selecting a diagnostic and focusing its YAML/resource.

## Verification
```bash
npm ci
node --test tests/studio-003-validation-diagnostics.test.js
npm run test:docker-compose
npm run test:kubernetes-studio-workflow
npm run test:all
npm run build
```
Review GitHub Actions results before approval. No local test/build success is claimed.
