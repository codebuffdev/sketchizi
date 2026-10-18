# Sketchizi Engineering Workbench 0.14.6 — Typed Connection Quick Connect

## Why this change exists

A user-visible diagram can contain arrows between React, a REST service, and PostgreSQL while the Workbench model still has `0 relations`. Those arrows are ordinary canvas connectors, not typed semantic relationships. Earlier guidance required selecting a component and manually creating each relationship in the Inspector, which was too easy to miss in the narrow Workbench panel. In addition, the blocked-results panel visually rendered advisory warnings with the same red treatment as true blockers.

## Changes

- The Experiments section now shows **Connect the typed request path** whenever the common React → REST service → PostgreSQL model has missing typed links, including when the active-view placement snapshot is temporarily unavailable but the model contains unique candidates.
- Users can create `Calls`, `Reads from`, or `Writes to` directly from that guidance. The controller validates endpoints, stores a real Workbench relation, increments the model revision, and saves the updated Sketchizi document.
- A visually drawn arrow is promoted in place when the arrow binding—or unambiguous endpoint geometry—matches the intended source and target. This preserves the existing connector and avoids a duplicate. If no safe match exists, Sketchizi creates a new typed connector.
- The Run experiments action remains disabled while the React traffic source lacks the required `Calls` relationship. Once the call exists, a missing database relationship can be added separately; disconnected runtime nodes are scoped out rather than included as orphan nodes.
- Blocked-result UI separates `blocker` diagnostics from `warning` and `info` diagnostics. `External API is approximated` is displayed as an advisory, never as the red blocker itself.
- Added regression tests for quick-connect wiring, arrow promotion, guidance fallback, and diagnostic severity partitioning.

## User workflow

1. Stop Vite (`Ctrl+C`).
2. Extract `sketchizi-workbench-typed-connection-quick-connect-0.14.6-patch.zip` over the current `sketchizi-main` folder, allowing it to replace the listed files.
3. Restart with `npm run dev -- --force`.
4. Open Workbench → Experiments. In **Connect the typed request path**, click **Create Calls relationship**.
5. Click **Create Reads from relationship** (and **Create Writes to relationship** if the modeled service also writes to PostgreSQL).
6. Confirm the footer relation count changes from `0` to at least `2` for the minimal read-path case, then review/confirm the newly in-scope synthetic profile and run experiments.

The button attempts to reuse an existing bound/unambiguously placed visual arrow. Ordinary arrows remain visual-only until explicitly promoted.

## Verification

- Complete Node test suite: **283 passed, 0 failed**.
- Focused quick-connect, guidance, diagnostics and simulation runner suites: **29 passed, 0 failed**.
- Changed `.js` module syntax checks: passed.
- Production build: **not verified**. `npm run build` stops in `prebuild` because this isolated package has no installed `node_modules/@excalidraw/excalidraw/dist/prod/fonts`; restore dependencies with `npm ci` in a network-enabled environment.
- Real-browser check for this patch: not run in this environment. Existing save/reload browser-smoke evidence from earlier prototype versions does not verify these new UI actions.

## Product and safety boundaries

This is a Sketchizi-owned workflow and model. It does not copy Breakscale's UI or simulator architecture. The adapter follows explicit Workbench relationships, preserves the distinction between visual drawing arrows and semantic relations, and never claims that synthetic External API behavior is a measurement of a real provider.
