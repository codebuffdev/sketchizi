# Workbench CI Run Helper — 0.77

Version 0.77 adds a machine-readable provenance receipt after a CI run has passed the existing workflow, branch, event (for script-dispatched runs), and commit identity checks.

## Run

From a Git clone on Windows PowerShell:

```powershell
gh auth login
.\scripts\run-workbench-ci.ps1
```

Inspect a completed run that still belongs to the current checked-out commit:

```powershell
.\scripts\run-workbench-ci.ps1 -RunId 123456789
```

The helper still requires local `HEAD` to match the requested remote branch and the selected run. It never pushes code.

## Evidence receipt

After the diagnostic bundle passes the importer and integrity verification, the helper writes `workbench-ci-run-metadata.json` and creates `workbench-ci-evidence-receipt.json` plus a Markdown summary. The receipt records the run URL, ID, workflow, branch, event, commit SHA, conclusion, bundle size and SHA-256, and the imported report's integrity summary. The receipt generator independently re-verifies the ZIP manifest and its file hashes and checks that the adjacent analysis report describes the same bundle, file count, and release status.

The helper still collects and analyzes the available evidence even for failed runs, then preserves the failing conclusion. The helper now requires exactly one `workbench-release-diagnostic-bundle.zip` in the downloaded artifact. It refuses ambiguous bundles rather than selecting the first matching path.

Validate a receipt manually by checking its `diagnosticBundle.sha256` against the ZIP bytes and reviewing the corresponding GitHub Actions run. The hash is an integrity fingerprint, not a digital signature. The receipt is not cryptographically signed by GitHub and does not independently prove GitHub authorship or correct application behavior. A valid receipt for a failed run preserves the failed conclusion.

## Verification boundary

Local unit and contract tests can verify receipt generation and identity guards, but they do not replace running the helper against an authenticated GitHub account. No GitHub Actions run is claimed unless it was actually executed and inspected.
