# Sketchizi 1.13.3 — Kubernetes Remediation Lifecycle

## Added
- Preserve remediation tasks when findings disappear during revalidation.
- Track each task's finding as active or resolved in current diagram diagnostics.
- Restore active state if a previously resolved finding reappears, preserving task status.
- Add active/resolved filters and per-task lifecycle labels.
- Add progress summary metrics: active findings, resolved findings, pending tasks for resolved findings, and checklist completion percentage.
- Include lifecycle and progress metrics in Markdown/JSON exports.

## Safety and scope
Finding resolution means only that a diagnostic is absent from the current diagram validation. It does not mean the underlying Kubernetes issue was fixed. Tasks remain pending until a user explicitly marks them complete. The checklist remains browser-local and does not apply changes to a live cluster.
