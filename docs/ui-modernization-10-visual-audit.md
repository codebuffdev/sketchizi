# UI Modernization 10 — Responsive Visual Audit

## Purpose

This phase adds a repeatable, browser-based visual audit for the premium/minimal UI across common viewport sizes. It is intended to expose layout regressions and provide screenshot evidence for review, not to claim pixel-perfect baseline comparison.

## Coverage

- Captures the creation screen at desktop (1440px), laptop (1280px), tablet (768px), mobile (390px), and mobile landscape (844px).
- Opens a blank editor at desktop and mobile widths and captures both states.
- Fails when the creation screen or editor introduces horizontal document overflow.
- Fails on browser page exceptions, console errors, and failed same-origin requests.
- Writes screenshots and a failure JSON report to `artifacts/ui-visual-audit/`.

## Run against staging

From GitHub Actions, select **Sketchizi UI Visual Audit** and provide the deployed staging URL. The workflow installs temporary Playwright tooling and Chromium, runs the matrix, then uploads screenshot artifacts even when the audit fails.

For a local run with Playwright installed:

```bash
SKETCHIZI_BASE_URL=https://your-staging-host.example npm run audit:ui-visual
```

## Limits

This is a screenshot-and-layout acceptance audit, not a pixel-diff system: there are no committed golden images, so screenshots must be reviewed by a person. It does not claim to validate all color contrast, keyboard flows, or every editor tool. Production build and browser execution must be confirmed by CI against the actual deployment.
