# Phase 17 — Architecture Review Workflow

## Overview

Adds a local review lifecycle to the existing Architecture Validation panel. A review captures a diagram graph snapshot, current diagnostics, references to architecture decision records, remediation tasks, owner, notes, and lifecycle timestamps.

## Lifecycle

- **Draft** — created from the active diagram and current findings.
- **In review** — entered when the reviewer updates or refreshes the session.
- **Finalized** — immutable snapshot; the reviewer can export it or start a new review.

## Persistence and export

The active review is stored in browser local storage under `sketchizi.system-design-review-workflow.v1`. The export includes a versioned JSON representation or a Markdown report. The workflow is local to the current browser and is not a shared/team collaboration service.

## Safety boundaries

- Starting a review snapshots the diagram; it does not change the canvas.
- Refreshing a review updates the snapshot only before finalization.
- Finalized reviews cannot be edited through the lifecycle service.
- Review findings and scores are advisory, not a production-readiness certification.
- No infrastructure is deployed or changed.

## Verification

- `npm run test:system-design-review-workflow`
- `npm run test:all`
- `npm run check:package-lock-consistency`

The production build still requires a complete dependency installation and font assets; it was not claimed as verified for this delivery.
