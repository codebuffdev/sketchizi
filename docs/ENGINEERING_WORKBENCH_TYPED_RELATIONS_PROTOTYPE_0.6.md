# Sketchizi Engineering Workbench — Typed Relationships and Inspector Prototype 0.6

## Scope

This is an experimental continuation of the 1.10.86 baseline plus Workbench file-format, persistence, and initial panel work. It adds a first typed relationship workflow and component property inspector. It is not a production release and has not been browser-verified.

## UX behavior

- Selecting a semantic Workbench component shows its inspector in the Workbench panel.
- Component name and type-specific properties can be edited in place.
- The shared semantic entity is updated and the model revision increments; the visible component label follows a name change.
- The inspector can create a typed relationship from the selected component to another component placed in the active view.
- A connector arrow is placed on the active view and tagged with the semantic relation ID. The semantic relation is stored once in the Workbench extension.
- Valid target components depend on relation type and the source component kind. The UI only offers target components placed in the active view.
- Existing arrows and ordinary drawings are not promoted into semantic relationships implicitly.

## Starter relation catalog

- `calls`: frontend/service/worker → service/API endpoint/external API
- `exposes`: REST service → API endpoint
- `reads`, `writes`: REST service/worker → PostgreSQL
- `publishes`, `subscribes`: REST service/worker or worker → queue, according to the relation's allowed-source registry
- `deploys-to`: frontend/service/worker → deployment target
- `authenticates-with`: frontend/service → REST service/external API
- `depends-on`: any registered component kind → any registered component kind (not itself)

The registry is intentionally small and versioned by stable kind IDs. It should be reviewed before being treated as the final domain ontology.

## Inspector properties

The initial property schema covers React base path/authentication, REST service base path/port, API endpoint method/path/operation ID, PostgreSQL database/schema, queue provider/name, worker concurrency/retry limit, external API base URL/authentication, and deployment environment/region.

## Tests run

- Workbench, format, and persistence focused suites: **21/21 passed**.
- Collaboration synchronization/diagnostics suites: **35/35 passed**.
- Node syntax checks passed for Workbench JavaScript modules.
- TypeScript compiler JSX parse check passed for `src/App.jsx` and `src/features/workbench/WorkbenchPanel.jsx`.

## Known verification limits

- `npm run build` did not reach Vite compilation. Its prebuild step reports that `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent. Run `npm ci` in a network-enabled environment and repeat the build.
- Real-browser UI and save/reload testing has not been run here.
- Connector placement, selection handling, keyboard navigation, resizing, dark/light appearance, and collaboration behavior need browser smoke testing.
- Semantic connector arrow placement currently uses component centers; future work should add endpoint binding/anchor routing and collision-aware rerouting.
- The relation registry has not yet been reviewed as a complete architecture ontology.

## Suggested verification

1. Run `npm ci` and `npm run build`.
2. Open a `.sketchizi` document and enable Workbench.
3. Add React application, REST service, and PostgreSQL components to System.
4. Select React, inspect/edit its name and properties, and create React `Calls` REST.
5. Select REST and create `Reads from` PostgreSQL; confirm invalid relation types/targets are not offered.
6. Save, reload, reopen, and verify entities, properties, relations, arrows, and other views.
7. Confirm ordinary `.excalidraw` files and Icon Library/freeform behavior are unchanged.
