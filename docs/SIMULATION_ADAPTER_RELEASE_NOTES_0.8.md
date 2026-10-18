# Engineering Workbench Simulation Adapter Prototype 0.8

- Adds the pure `buildSimulationProjection()` adapter and engine-neutral SimIR.
- Introduces explicit profile parameters instead of silently inheriting any engine defaults.
- Preserves entity and relationship provenance, including original relationship orientation when queue subscription flow is reversed for runtime representation.
- Groups database reads/writes into one runtime hop to avoid double-counting downstream requests.
- Blocks ambiguous route branching, synchronous cycles, unresolved endpoint ownership, missing/invalid profiles, unconfirmed marked assumptions, and invalid scenarios.
- Does not add a simulator engine, copy Breakscale code, change the Workbench UI, or resume OpenAPI/SQL generation.
