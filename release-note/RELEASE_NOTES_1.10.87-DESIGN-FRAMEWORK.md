# Sketchizi 1.10.87 — Shared Design Model and Template Framework

## Added
- Create Design workflow for blank canvases, template-driven designs, and built-in design patterns.
- Versioned design profile metadata stored in the existing `.sketchizi` extensions envelope.
- Built-in starters for system architecture, process flow, database/ERD, layered architecture, and event-driven architecture.
- Guided and strict template rule modes.
- Template validation diagnostics for required roles, bound connectors, and supported relationship constraints.
- Tests for profile normalization, starter graph construction, validation modes, and file round-tripping.

## Compatibility
- Existing `.sketchizi` format version remains 1.
- Existing `.excalidraw` serialization remains standard Excalidraw JSON.
- Existing element metadata and unrelated document extensions are preserved.
- Existing collaboration, persistence, AI Ask, and architecture-specific services are not intentionally changed.

## Verification
- Design framework and file-format tests pass.
- Networking, architecture catalog, and UI-default regression tests pass.
- Production build could not be verified in this environment because npm dependency installation could not complete (the npm registry request timed out).
