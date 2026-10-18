# Sketchizi Workbench 0.19 — Request-Level Trace Inspection

## Objective

Add bounded, inspectable request-level evidence to the Workbench's deterministic discrete-event simulation so engineers can investigate the journey and delay components of a sampled request without implying live distributed tracing.

## Implementation

- Bumped the simulation engine version to `0.3.0` and result schema version to `3`.
- Added event-derived per-request trace records with request ID, outcome, arrival/completion timestamps, total modeled latency, observation-window/drain classification, and per-hop component identity.
- Traces begin with the React traffic-source hop (`sent`) and continue through the modeled service/store path. Processing hops record arrival time, queue wait (when serviced), service start/end times, service time, and outcome (`completed`, `success`, `failed`, `unavailable`, or `dropped`). The traffic-source hop does not claim to consume processing time; unavailable/dropped hops explicitly have no service time.
- Trace capture is bounded: retain the first three examples by each terminal outcome plus the 20 highest-latency terminal requests. The union is at most 29 traces per scenario. `totalTerminalRequests` discloses the number of terminal requests overall; the UI labels the displayed set as sampled.
- The UI adds a collapsed **Request-level traces** inspector with a request selector, outcome/end-to-end summary, per-hop queue/service breakdown, and Focus component actions.
- Experiment history now persists trace data alongside metrics and time-series data. Older saved entries without request traces remain supported; the UI simply omits the trace inspector for those results.
- No trace data is written as canvas elements and request instrumentation does not alter the random stream or request scheduling.

## Verification

The following test command groups passed with zero failures:

| Command group | Passed | Failed |
|---|---:|---:|
| `npm run test:simulation` | 69 | 0 |
| `npm run test:simulation-guidance` | 35 | 0 |
| `npm run test:workbench-artifacts` | 11 | 0 |
| `npm run test:workbench-poc` | 13 | 0 |
| `npm run test:workbench-ui` | 32 | 0 |
| `npm run test:workbench-validation` | 25 | 0 |
| `npm run test:workbench-format` | 22 | 0 |
| `npm run test:sync` | 35 | 0 |
| `npm run test:browser-verification-server` | 6 | 0 |
| `npm run test:font-assets` | 7 | 0 |
| **Test executions summed across groups** | **255** | **0** |

Suite counts overlap; 255 is the sum of executions reported by these commands, not a count of unique tests. Additional focused engine/history/UI checks passed (22/22). The runnable simulation example also completed baseline, traffic-surge, and database-outage scenarios with the same aggregate metrics as before instrumentation.

JSX parsing passed for `SimulationExperimentPanel.jsx`, `WorkbenchPanel.jsx`, `SketchiziCanvas.jsx`, and `App.jsx`. JavaScript syntax checks passed for the changed engine/history/test modules. ZIP integrity is checked after packaging.

## Not verified

- **Production build:** `npm run build` stops in `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent. Dependency restoration (`npm ci`) is required in an environment with registry access.
- **Real browser interactions:** not run in this environment. The trace selector, component-focus buttons, layout, and persisted traces need local browser verification.
- The trace data is synthetic output from Sketchizi's discrete-event model, not telemetry from a deployed application and not a full OpenTelemetry/distributed trace.

## Focused verification

- Engine + history + trace UI focused suite: **22 passed, 0 failed**.
- Runnable `examples/simulation/workbench-experiment-runner.mjs`: completed baseline, 5× traffic, and PostgreSQL outage scenarios with unchanged aggregate scenario results after trace instrumentation.

## Suggested local verification

From the extracted `sketchizi-main` directory:

```powershell
npm ci
npm run build
npm run test:request-traces
npm run dev
```

Run the POC baseline, traffic-surge, and database-outage scenarios. Open **Request-level traces** under each completed scenario, select successful/failed/dropped samples, inspect hop timing, and click **Focus component**. Save and reopen the `.sketchizi` file and confirm trace evidence remains available in saved experiment history.

## Suggested commit

`feat(simulation): add bounded request-level trace inspection`
