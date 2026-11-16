# Phase 16 — Architecture Review Report

## Scope

Adds a complete architecture-review export that combines current diagram graph counts and entities, structural diagnostics, optional architecture comparison and locally stored Architecture Decision Records (ADRs).

## Exports

- Markdown: readable report for design reviews and pull requests.
- JSON: versioned structured report for later processing.

## Safety and limitations

- Findings remain advisory and do not modify the canvas.
- Comparison scores are heuristic and are not runtime measurements.
- The report explicitly states that it is not a production-readiness certification.
- ADRs are included from browser-local decision records only; they are not uploaded to a service.
- No infrastructure is provisioned by report generation.

## Changed files

- `src/features/architecture/systemDesignReviewReport.js`: report model and Markdown renderer.
- `src/components/app/ArchitectureValidationPanel.jsx`: adds Markdown and JSON export controls.
- `tests/system-design-review-report.test.js`: report composition, rendering and malformed-input tests.
- `package.json`: adds `test:system-design-report`.

## Verification

- `npm run test:all`: 431 passed, 0 failed.
- `npm run check:package-lock-consistency`: 19/19 passed.
- Direct ES module import of the report builder: passed.
- Production build: not verified in this environment; dependency installation / Excalidraw font availability remains a separate release gate.
