# Sketchizi Workbench UI/UX Polish 0.16.3

**Baseline:** `sketchizi-workbench-ui-ux-cleanup-0.16.2.zip`  
**Application package version:** remains `1.10.86`  
**Scope:** Focused Workbench UI/UX refinement and active-view simulation guidance. The canonical semantic model, artifact generators, experiment engine, and result metrics are unchanged.

## What changed

### 1. Component catalog is easier to scan
- Added a search field filtering component label, description, category, and semantic kind.
- Made catalog categories collapsible. Application and Data start expanded; less commonly used Contracts, Integrations, and Deployment categories can stay collapsed.
- Shows result counts at both catalog and category levels and provides an explicit no-results state plus clear-search action.
- Tightened component row spacing and icon dimensions while preserving the registry and add-component handler.

### 2. Inspector empty state has next actions
- Replaced the plain instructional sentence with a compact empty-state card.
- Added **Browse components** to open Add.
- When the user is outside System view, added **Go to System view**.
- Existing selected-component inspector properties and relationship creation behavior are unchanged.

### 3. Run pane explains the active-view problem
- Detects when the active view scope contains no React traffic source.
- Displays a clear notice explaining why request-path simulation is unavailable.
- Adds a **Switch to System view** action when another view is active, or a component-catalog action when already in System.
- Disables profile preparation and experiment execution while that required traffic source is absent, and provides a defensive guard in the run handler.
- Does not weaken or bypass typed relationship validation.

### 4. Visual hierarchy and compactness
- Tightened view selector dimensions and spacing to make the four task tabs more prominent sooner.
- Tuned catalog row sizing, focus/hover states, and empty states for light and dark themes.
- Preserved the single main scroll region and fixed panel header/footer.

## Files changed

- `src/features/workbench/WorkbenchPanel.jsx`
- `src/features/simulation/experiments/SimulationExperimentPanel.jsx`
- `src/styles/workbench.css`
- `tests/workbench-panel-layout.test.js`
- `tests/workbench-quick-connect-integration.test.js`

## Verification

| Check | Result |
|---|---:|
| Focused Node test executions across 8 commands | **231 passed, 0 failed** |
| Commands | `test:workbench-ui`, `test:workbench-poc`, `test:workbench-artifacts`, `test:simulation-guidance`, `test:simulation`, `test:workbench-validation`, `test:workbench-format`, `test:sync` |
| TypeScript transpiler JSX syntax check | Passed for `WorkbenchPanel.jsx` and `SimulationExperimentPanel.jsx` |
| Production build | **Not verified**; stops in `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is missing. `npm ci` is required in a network-enabled environment. |
| Real-browser layout/interactions | **Not verified** in this environment |

Test executions overlap between commands; 231 is the sum of executions reported by the specified commands, not a count of unique test cases.

## Manual verification needed

After installing dependencies on Windows, run `npm run build` and `npm run dev`. Check:

1. Add → search for `postgresql`, clear search, collapse and expand categories, add a component.
2. Inspect with no selection; use Browse components and Go to System view.
3. Open Run while Data/Deployment view is active; confirm the traffic-source notice and System-view action work.
4. Run the baseline/traffic/outage suite from a valid System POC; verify results still survive tab switches.
5. Verify at full-screen and half-screen widths in both Day and Night themes.

## Suggested commit

`ux(workbench): improve catalog search and simulation scope guidance`
