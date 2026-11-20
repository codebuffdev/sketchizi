# Sketchizi — Coding Agent Instructions

This file is the baseline operating contract for AI coding agents working in **codebuffdev/sketchizi**. Treat a request as an engineering task, not an instruction to generate a large unreviewed change.

## Project map

- Frontend: React, JavaScript, Vite, Excalidraw.
- Entry points and UI: `src/App.jsx`, `src/main.jsx`, `src/components/`, `src/features/`, `src/styles/`.
- Frontend-specific cloud endpoints: `functions/`; local collaboration and Compose utilities: `server/`.
- Tests: `tests/`; verification scripts: `scripts/`; domain guidance: `docs/`.
- Separate Spring Boot backend repository: `codebuffdev/sketchizi-backend`. Do not presume that a frontend PR also changes the backend.

Read `README.md`, applicable documentation, relevant source files, tests, and `package.json` before proposing changes. Do not invent paths, scripts, or existing behavior.

## Operating loop

1. **Understand:** Reproduce or explain the issue, identify the affected workflow and files, and inspect current tests.
2. **Plan:** State scope, acceptance criteria, risks, files likely to change, and verification approach. For nontrivial behavior or ambiguous architecture, obtain product/architecture direction before implementation.
3. **Implement:** Work on a short-lived feature/fix branch. Make the smallest coherent change and preserve unrelated functionality. Never commit secrets, generated build output, or unreviewed dependency upgrades.
4. **Verify:** Run focused tests, then the broad checks appropriate to the change. For UI changes, inspect the behavior in a browser when tooling is available and cover responsive layouts, theme variants, and drawing interactions.
5. **Report:** Open a PR with a human-readable summary, before/after evidence, commands and actual results, risks, and follow-up tasks. Leave the PR unmerged for human review.

## Change boundaries and product invariants

- **Never commit directly to `main` or merge a PR unless the user explicitly approves that merge.**
- Never bypass or weaken tests, security controls, build checks, or CI just to get a green result.
- Preserve drawing-first usability: accessible canvas, predictable editor tools, unobstructed controls, keyboard/focus behavior, mobile layouts, and light/dark themes.
- Preserve document integrity across create, save, reload, import/export, and undo/redo when affected by the change.
- Keep Kubernetes Studio, Docker Compose Studio, collaboration, authentication, and cloud persistence working. Exercise the impacted integrations rather than assuming a passing unit test proves end-to-end correctness.
- Never expose backend credentials in `VITE_*` variables or client assets. Avoid logging tokens, document contents, or private data.
- Avoid broad refactors in bug-fix PRs; state an explicit reason if a broader change is essential.

## Verification commands (frontend)

Use the exact scripts in `package.json`; prefer locked dependency installation.

```bash
npm ci --no-audit --no-fund
npm run check:package-lock-consistency
npm run check:build-prerequisites
npm run test:all
npm run build
```

During implementation, also run focused tests using the applicable `npm run test:...` script or `node --test tests/<relevant-file>.test.js`. The repository's production CI additionally runs browser smoke checks for template creation, drawing/persistence, and mobile widths. For changes in visual behavior, run the corresponding Playwright smoke/visual audit when a browser and preview environment are available; supply screenshots or equivalent evidence.

**Never claim a check passed unless you ran it and observed success.** If tools, permissions, secrets, or browser support are unavailable, report the exact unverified check and let CI or a reviewer validate it. Investigate CI failures, including apparently unrelated ones, and clearly distinguish pre-existing failures from changes caused by the PR.

## PR completion contract

Every PR must include:

- User-visible problem, intended outcome, and explicit scope.
- Acceptance criteria, including at least one regression case where relevant.
- What changed and why; list impacted features/data contracts.
- Commands **actually run**, results, and links to CI; list skipped checks honestly.
- UI before/after screenshots or a short visual verification note for UI work.
- Risks, rollback notes, and unresolved issues.

Treat **merged** as separate from **implemented**, **tested**, and **review-ready**. A green build alone does not constitute product approval. See `docs/agentic-development.md` for the full workflow.
