# Sketchizi 1.10.49 — Collaboration failure diagnostics

- Preserves collaboration server/client failure messages when the host creation flow fails.
- Displays the actual failure reason in the non-blocking header status and keeps the full text available via its title.
- Adds a specific timeout message that directs diagnosis toward the deployed `VITE_COLLAB_WS_URL` and collaboration server health.
- Keeps the existing retry action, authentication flow, collaboration protocol, and joinee path unchanged.
- Adds regression tests for failure-reason propagation and header display.
