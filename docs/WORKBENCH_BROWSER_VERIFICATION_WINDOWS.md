# Run the Workbench persistence browser test on Windows

This test uses real browser IndexedDB/localStorage and forces a page reload. It is isolated to `http://127.0.0.1:8765`, so it does not touch data stored by your normal Sketchizi site (`https://sketchizi.pages.dev`) or local Vite development origin (`http://localhost:5173`).

## Steps

1. Extract this ZIP to a folder.
2. Open PowerShell in the extracted `sketchizi-main` project folder.
3. If Windows blocks scripts for this session, run `Set-ExecutionPolicy -Scope Process Bypass` in that PowerShell window only.
4. Run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-browser.ps1
   ```

5. A browser tab opens. Wait for the page to perform a reload and display `PASS — browser reload and simulation-history test` with all individual checks marked `PASS`.
6. Return to PowerShell and press Enter to stop the temporary server.

The test writes only to storage scoped to `127.0.0.1:8765`; it does not use the normal app's storage origin.

## If it fails

Copy the complete red `FAIL` message and the checks displayed below it, then share them. Do not report a pass if the page does not finish its reload and show all checks as passing.

## Manual fallback

If PowerShell scripts are unavailable, open PowerShell in the project root and run:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/tests/browser/workbench-persistence-smoke.html` in the browser. Stop the server with Ctrl+C after recording the result.

## Scope

This verifies real browser IndexedDB/localStorage, simulation-history persistence, stale-result detection, and serializer persistence after a reload. It does not by itself verify the complete React/Excalidraw app startup lifecycle or prove the production bundle builds.
