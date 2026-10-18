# Automated Workbench Browser Verification

The isolated smoke page now reports its result back to the local test runner. The PowerShell command waits for that report and exits with code `0` on pass, `1` on test failure, or an error on timeout.

## Run on Windows

1. Extract this source ZIP.
2. Open PowerShell in the `sketchizi-main` directory.
3. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-browser.ps1
```

The script starts a short-lived Node HTTP server bound only to `127.0.0.1:8765`, opens the isolated smoke page, and waits up to 180 seconds for a final status. The browser page runs a seeded Workbench simulation, saves and reloads a `.sketchizi` record, restores simulation history without rerunning, and checks model/profile stale-state behavior.

The status endpoint returns only a local result payload. The result endpoint accepts reports only from the exact test-page origin. The server includes path-traversal protection, a request size limit, no-store headers, and no external network calls.

The test uses `http://127.0.0.1:8765`, which has a separate browser storage origin from the deployed application and the usual Vite development origin. It will overwrite only records at that isolated origin.

## Limitations

This verifies the persistence modules and simulation orchestration in a real browser. It does not exercise the complete visible React/Excalidraw Workbench UI. Run `npm ci` and `npm run build` separately in a network-enabled environment before treating the overall application as build-verified.
