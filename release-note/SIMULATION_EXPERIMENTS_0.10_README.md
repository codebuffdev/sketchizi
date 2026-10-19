# Engineering Workbench — Simulation Experiments 0.10

This experimental source package adds the first Workbench-facing experiment and result-explanation workflow to Sketchizi's own deterministic simulation engine. It is not a Breakscale clone and does not import Breakscale code.

## Run locally

1. Extract the ZIP to a working directory.
2. Use Node.js compatible with this project's Vite 5 setup.
3. Run `npm ci` to install dependencies.
4. Run `npm run dev`.
5. Open a `.sketchizi` document or create one, then enable Engineering Workbench.
6. Add a React application, REST service and PostgreSQL component. Create a **Calls** relation from the React app to the REST service and **Reads from** / **Writes to** relations from the service to PostgreSQL.
7. Open **Experiments**, choose **Prepare illustrative profile**, review each proposed profile, save edits if any, acknowledge the assumptions, and click **Run experiments**.
8. Switch among Baseline, 5× traffic and the database/service outage scenario. Inspect metric changes and open **Run provenance and assumptions**. Click an explanation to focus its component on the canvas.

## What the panel runs

- Baseline: configured seeded traffic.
- 5× traffic: identical profile and seed with offered traffic multiplied by five.
- Outage: makes PostgreSQL unavailable when present, otherwise the first supported REST/external processing component unavailable.

The current engine supports only a narrow synchronous request path. A model that includes queue/worker asynchronous flow, non-zero timeouts or retries, cycles, unsupported nodes, or ambiguous branching is blocked. This is intentional: the tool should report unsupported semantics, not invent them.

## Assumptions and persistence

Starter performance values are synthetic. They do not come from live services. The user must explicitly acknowledge them before running. Edited profiles are saved within the Workbench document extension; experiment result sets remain in current UI memory and are not archived into the document in this iteration. Reopening the document requires reviewing proposed assumptions again.

## Verification status

See `docs/SKETCHIZI_SIMULATION_EXPERIMENT_RESULTS_0.10.md`. Focused Node test suites passed. The production Vite build and real-browser interactions remain unverified in the current environment because Excalidraw's font assets and complete dependencies are unavailable.
