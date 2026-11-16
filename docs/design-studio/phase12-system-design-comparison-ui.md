# Phase 12 — System Design Comparison UI

## Delivered

- Integrated a comparison workspace into the existing Architecture Validation panel.
- Compares the current canvas graph with an alternative graph supplied as JSON (`nodes` and `edges`).
- Shows both heuristic scores, grade labels, score delta, metric deltas, and the comparison caveat.
- Supports exporting the comparison result as JSON.
- Validates the alternative graph input and presents parsing/schema errors through an accessible alert.
- Responsive styling is included for narrow screens.

## Alternative graph format

```json
{
  "nodes": [
    { "id": "client", "name": "Client", "role": "client" },
    { "id": "api", "name": "API", "role": "api", "replicas": 2 }
  ],
  "edges": [
    { "id": "client-api", "sourceId": "client", "targetId": "api" }
  ]
}
```

## Limitations

- The current canvas is read from the active Excalidraw scene. The alternative design is currently provided as graph JSON; loading saved `.sketchizi` files directly into the comparison UI is not part of this phase.
- Scores are heuristic and use currently implemented structural checks. They do not measure latency, cost, throughput, or real-world availability.
- Component identifiers should be stable and semantically comparable for meaningful finding differences.
- Production build and browser verification require a successful dependency installation and are not asserted by the source-contract tests.

## Verification

- `npm run test:all`: 417 tests passed, 0 failed.
- Focused comparison tests: 9 passed, 0 failed.
- Production build: not run; dependency installation is unavailable in this environment.
