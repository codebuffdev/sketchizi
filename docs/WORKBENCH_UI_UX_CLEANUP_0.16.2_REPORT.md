# Sketchizi Workbench UI/UX Cleanup 0.16.2

**Baseline:** Workbench POC template 0.16.1 source; application package version remains `1.10.86`.

## Problem addressed

The Workbench panel exposed views, POC workflow, model findings, artifact generators and source preview, simulation assumptions, scenario comparisons, per-run metrics, explanations, provenance, the entire component catalog, and the component inspector in one long vertical scroll. Users had to take many screenshots to understand a single result. The artifact source preview and scenario details added further visual weight.

## Changes

- Added persistent task navigation for **Build**, **Run**, **Add**, and **Inspect**. Each task has its own visible pane, instead of stacking every section in the same scroll.
- Kept all task panes mounted while hiding inactive panes, so the simulation panel's in-memory results and controlled improvement comparison survive tab switching.
- Made the task navigation sticky and kept the Workbench's single primary scroll container.
- Updated POC workflow buttons to switch to the appropriate task pane; Configure also focuses the React application.
- Collapsed Model Review details by default while keeping error and warning counts visible. Users can expand findings when they need the specifics.
- Changed generated artifact source from an always-visible, nested-scroll code window into an explicit **View preview** action. When shown, the source wraps within the main panel rather than creating a second scrollbar. Download and dismiss actions remain available.
- Collapsed the full scenario comparison/pressure/insight overview by default; its summary still advertises completion count. The selected scenario's primary metrics remain visible.
- Collapsed simulation-scope explanation behind “What gets simulated?” and shortened the introductory copy.
- After a successful run or opening saved results, the simulation profile editor closes to keep the result in view; users can reopen it to inspect or change assumptions.
- Limited result explanation cards to the first two by default, with a **Show all explanations** control for the full list.
- Added regression coverage for the task panes, progressive disclosures, and compact result layout.

## Behavior deliberately preserved

- Canonical Workbench model and typed relationship semantics.
- Simulation engine, scenarios, metrics, profiles, assumptions, and experiment history behavior.
- OpenAPI and SQL generators and model revision/stale-preview checks.
- POC template creation, semantic identity, save/load contracts, standard Excalidraw support, collaboration, and theme rules.
- No validation was weakened and no simulation metrics were changed.

## Verification

| Check | Result |
|---|---:|
| Automated Node tests across 15 suites | **298 passed, 0 failed** |
| Workbench layout/UI suite | **29 passed, 0 failed** |
| POC template/UI suite | **13 passed, 0 failed** |
| JSX transpile syntax check (`WorkbenchPanel.jsx`) | Passed |
| JSX transpile syntax check (`SimulationExperimentPanel.jsx`) | Passed |
| ZIP integrity | Checked after packaging |
| Production build | **Not verified** — prebuild exits because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent in this environment |
| Full React/Excalidraw browser UI | **Not verified** — needs dependency restore and local browser run |

The 298 tests are the sum of the executed test commands (15 suites); this is not necessarily a count of unique test cases. The browser verification-server protocol tests passed, but they are not proof of a complete visual browser interaction test.

## Local verification on Windows

From the extracted `sketchizi-main` directory:

```powershell
npm ci
npm run build
npm run test:workbench-ui
npm run test:workbench-poc
npm run test:workbench-artifacts
npm run test:simulation-guidance
npm run test:simulation
npm run dev
```

In the Workbench, verify tab switching among Build / Run / Add / Inspect, expanding Model Review, generating an artifact and opening its source preview, running the three scenarios, expanding the full comparison, and switching away from and back to Run without losing the current experiment output. Verify at full-screen and half-screen widths.

## Suggested Git commit

`ux(workbench): separate tasks and collapse secondary simulation details`
