# Sketchizi Engineering Workbench — Simulation Experiments 0.10

## Purpose

Add an explanatory experiment workflow to the Sketchizi-owned simulation engine. This is a Sketchizi-specific product layer, not a copy of Breakscale's UI or architecture.

## UI workflow

1. Open Engineering Workbench on a document with semantic components.
2. Choose **Prepare illustrative profile**. The generated profile is saved inside the Workbench document extension and labelled as synthetic defaults.
3. Expand a runtime component to edit traffic/service/database parameters. Use **Save profile** to persist changes.
4. Explicitly acknowledge the displayed synthetic assumptions.
5. Run the experiment set: baseline, five-times offered traffic, and an outage of PostgreSQL if present (otherwise the first supported processing service).
6. Select a scenario to inspect metrics and baseline deltas. Select an explanation to focus its entity on the canvas.
7. Expand run provenance to inspect model revision/fingerprint, adapter and engine version, seed, window, and run fingerprint.

## Explanations

The explanation builder emits model-linked warnings for observed component capacity pressure, request drops and terminal failures. The explanation identifies the source Workbench entity and carries numeric evidence used for the conclusion. It does not claim that a simulated result is a production measurement.

Comparison metrics include offered, successful, failed, and dropped requests; successful throughput; successful p95 latency; and success rate. Absolute deltas are shown with the baseline/current values.

## Profile behavior

- Starter profiles are explicitly illustrative and marked proposed.
- A user must acknowledge the assumptions before running.
- A run-local confirmation marks the profile values as confirmed for that run. The saved profile remains proposed, so reloading the document requires explicit review again.
- Simulation profile data is stored as an additional property of the Workbench extension, separate from semantic component properties. The existing Workbench document validator preserves this property.
- Supported starter profiles exist only for React traffic sources, REST services, PostgreSQL stores, and generic external API approximations.
- Queue/worker simulation, retries, timeout/cancellation, branching/conditional routes, and multi-edge semantics remain unsupported. The projection/engine must block unsupported models instead of providing misleading results.

## Verification

- Simulation projection + engine + experiment analysis/profile persistence: 32 tests passed.
- Workbench validation: 24 tests passed.
- Workbench file-format/persistence: 21 tests passed.
- Collaboration sync: 35 tests passed.
- Recovery: 1 test passed.
- Changed JavaScript modules and test files pass `node --check`.

The Vite production build remains unverified. `npm run build` stops at the prebuild font-copy step because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is missing. A dependency restoration attempt did not complete inside this environment's command window. JSX/browser integration and UI interactions therefore remain unverified.

## Safety and compatibility

- Original stable 1.10.86 ZIP remains untouched.
- This prototype source ZIP excludes `node_modules`.
- Generated results are synthetic, bounded by engine v0.1, and not operational forecasts.
- OpenAPI and SQL generation remain paused until the first end-to-end simulation scenario is proven reproducible and explainable.
