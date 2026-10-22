# Sketchizi Workbench 0.82 — Architecture Change Impact Analysis

## Product increment

- Adds a saved-baseline selector that compares a prior experiment's semantic model snapshot with the current Workbench architecture.
- Detects added, removed, and modified components and typed relationships; reports the fields changed and marks relationship endpoints as affected.
- Separates semantic-model comparison from canvas layout; object-key and collection ordering differences do not create false changes.
- Adds navigation from change rows to involved components on the canvas.
- Connects the architecture diff to baseline/current simulation metrics only when current results match the proposed semantic model and the saved/current profile fingerprints and component scopes match.
- Withholds comparative simulation metrics when results are stale, profile assumptions differ, scope is different/unknown, or required data is absent.
- Labels all simulation comparisons as synthetic model outputs rather than production measurements. Does not edit the canonical model or automatically apply proposed changes.

## Verification

- `node --test tests/architecture-change-impact.test.js`: 6 passed.
- Focused architecture-impact, optimization-portfolio, and simulation-history tests: 23 passed.
- `npm run test:simulation`: 181 passed.
- `npm run test:workbench-format`: 22 passed.
- `npm run test:workbench-artifacts`: 11 passed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `node --check src/features/simulation/experiments/architectureChangeImpact.js`: passed.
- ZIP archive integrity check: passed.
- Production Vite build and real browser interaction were not run because the ZIP workspace has no local Vite executable. JSX/browser behavior should not be treated as verified by this test set alone.
