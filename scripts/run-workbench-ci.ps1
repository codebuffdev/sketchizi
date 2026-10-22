[CmdletBinding()]
param(
  [string]$Ref,
  [string]$OutputDirectory = "artifacts/ci-downloads",
  [int]$PollSeconds = 10,
  [int]$TimeoutMinutes = 95,
  [long]$RunId = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$workflow = ".github/workflows/workbench-release-gate.yml"
$expectedWorkflowName = "Workbench release gate"
$artifactName = "workbench-release-gate-diagnostics"
$repoRootOutput = git rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0 -or -not $repoRootOutput) {
  throw "Run this script from inside a Git clone of Sketchizi."
}
$repoRoot = ($repoRootOutput | Select-Object -First 1).Trim()
Set-Location $repoRoot

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) is required. Install it, then run 'gh auth login'."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required to inspect the downloaded diagnostic bundle."
}

& gh auth status 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { throw "GitHub CLI is not authenticated. Run 'gh auth login' and retry." }

if (-not $Ref) {
  $Ref = (git branch --show-current).Trim()
  if (-not $Ref) { throw "Detached HEAD detected. Supply -Ref with the branch to test." }
}

$localHead = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "Unable to resolve local HEAD." }
$remoteLine = (git ls-remote --heads origin $Ref 2>$null | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or -not $remoteLine) { throw "Remote branch '$Ref' was not found on origin. Push the branch before running CI." }
$remoteHead = ($remoteLine -split '\s+')[0]
if ($remoteHead -ne $localHead) {
  throw "Local HEAD ($localHead) differs from origin/$Ref ($remoteHead). Commit and push the intended source before triggering CI. No push was performed by this script."
}

$runStartedAt = [DateTimeOffset]::UtcNow
$dispatchedByThisScript = $RunId -le 0
if ($RunId -le 0) {
  Write-Host "Dispatching '$workflow' for origin/$Ref at $localHead ..."
  & gh workflow run $workflow --ref $Ref
  if ($LASTEXITCODE -ne 0) { throw "GitHub Actions workflow dispatch failed." }

  $deadline = [DateTimeOffset]::UtcNow.AddMinutes(5)
  while ($RunId -le 0 -and [DateTimeOffset]::UtcNow -lt $deadline) {
    $json = & gh run list --workflow $workflow --branch $Ref --event workflow_dispatch --limit 20 --json databaseId,status,createdAt,headSha,event
    if ($LASTEXITCODE -ne 0) { throw "Unable to list GitHub Actions runs." }
    $runs = @($json | ConvertFrom-Json)
    $candidate = $runs |
      Where-Object { $_.headSha -eq $localHead -and $_.event -eq "workflow_dispatch" -and [DateTimeOffset]::Parse($_.createdAt) -ge $runStartedAt.AddMinutes(-1) } |
      Sort-Object { [DateTimeOffset]::Parse($_.createdAt) } -Descending |
      Select-Object -First 1
    if ($candidate) { $RunId = [long]$candidate.databaseId; break }
    Start-Sleep -Seconds $PollSeconds
  }
  if ($RunId -le 0) { throw "Workflow was dispatched, but its run ID did not appear within five minutes. Check the Actions tab manually." }
}

Write-Host "Monitoring GitHub Actions run $RunId ..."
$deadline = [DateTimeOffset]::UtcNow.AddMinutes($TimeoutMinutes)
$run = $null
while ([DateTimeOffset]::UtcNow -lt $deadline) {
  $json = & gh run view $RunId --json status,conclusion,url,headSha,event,headBranch,workflowName
  if ($LASTEXITCODE -ne 0) { throw "Unable to inspect GitHub Actions run $RunId." }
  $run = $json | ConvertFrom-Json
  Write-Host ("Run status: {0}; conclusion: {1}" -f $run.status, $run.conclusion)
  if ($run.status -eq "completed") { break }
  Start-Sleep -Seconds $PollSeconds
}
if (-not $run -or $run.status -ne "completed") {
  throw "Timed out waiting for run $RunId. View it at $($run.url) and rerun this script with -RunId $RunId to collect its artifact later."
}
if ($run.workflowName -ne $expectedWorkflowName) {
  throw "Run $RunId belongs to workflow '$($run.workflowName)', not '$expectedWorkflowName'. Refusing to analyze unrelated workflow evidence."
}
if ($run.headBranch -ne $Ref) {
  throw "Run $RunId belongs to branch '$($run.headBranch)', not requested branch '$Ref'. Refusing to analyze evidence from a different branch."
}
if ($dispatchedByThisScript -and $run.event -ne "workflow_dispatch") {
  throw "Expected the newly dispatched run to use workflow_dispatch, but run $RunId used '$($run.event)'. Refusing to analyze an unrelated run."
}
if ($run.headSha -ne $localHead) {
  throw "Run $RunId used commit $($run.headSha), not local HEAD $localHead. Refusing to analyze evidence from different source code."
}

$outputRoot = Join-Path $repoRoot $OutputDirectory
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
# Isolate each run so a ZIP from an older run can never be selected as current evidence.
$destination = Join-Path $outputRoot ("run-{0}" -f $RunId)
if (Test-Path -LiteralPath $destination) {
  Remove-Item -LiteralPath $destination -Recurse -Force
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Write-Host "Downloading '$artifactName' to $destination ..."
& gh run download $RunId --name $artifactName --dir $destination
if ($LASTEXITCODE -ne 0) {
  throw "Could not download '$artifactName' from run $RunId. Check whether the run uploaded artifacts."
}

$bundles = @(Get-ChildItem -Path $destination -Recurse -File -Filter "workbench-release-diagnostic-bundle.zip")
if ($bundles.Count -eq 0) { throw "Expected workbench-release-diagnostic-bundle.zip was not found in the downloaded artifact at $destination. Refusing to inspect an unrelated or stale ZIP." }
if ($bundles.Count -ne 1) { throw "Expected exactly one workbench-release-diagnostic-bundle.zip, but found $($bundles.Count). Refusing to choose ambiguous CI evidence." }
$bundle = $bundles[0]
Write-Host "Inspecting $($bundle.FullName) ..."
& node "scripts/inspect-workbench-release-diagnostic-bundle.mjs" $bundle.FullName
if ($LASTEXITCODE -ne 0) { throw "Diagnostic import or integrity verification failed. Inspect the verifier output above." }

# Record only metadata for the run that passed all identity guards above.
$runMetadata = [ordered]@{
  schemaVersion = 1
  collectedAt = [DateTimeOffset]::UtcNow.ToString("o")
  requestedRef = $Ref
  localHead = $localHead
  run = [ordered]@{
    id = [long]$RunId
    url = [string]$run.url
    workflowName = [string]$run.workflowName
    status = [string]$run.status
    conclusion = [string]$run.conclusion
    headSha = [string]$run.headSha
    headBranch = [string]$run.headBranch
    event = [string]$run.event
  }
}
$metadataPath = Join-Path $bundle.DirectoryName "workbench-ci-run-metadata.json"
$runMetadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $metadataPath -Encoding utf8
& node "scripts/write-workbench-ci-evidence-receipt.mjs" $metadataPath $bundle.FullName
if ($LASTEXITCODE -ne 0) { throw "CI evidence receipt generation failed. The diagnostic bundle was inspected, but no trustworthy collection receipt was written." }
$receiptPath = Join-Path $bundle.DirectoryName "workbench-ci-evidence-receipt.json"
& node "scripts/verify-workbench-ci-evidence-receipt.mjs" $receiptPath $bundle.FullName
if ($LASTEXITCODE -ne 0) { throw "CI evidence receipt verification failed. The collected evidence cannot be treated as verified." }

Write-Host ""
Write-Host "CI run: $($run.url)"
Write-Host "Conclusion: $($run.conclusion)"
Write-Host "Diagnostic bundle: $($bundle.FullName)"
Write-Host "Run metadata: $metadataPath"
Write-Host "Analysis and evidence receipt reports are saved beside the bundle."
if ($run.conclusion -ne "success") {
  Write-Error "The Workbench release gate did not pass ($($run.conclusion)). The diagnostic bundle was collected; inspect its first-failure analysis."
  exit 1
}
Write-Host "Workbench release gate passed." -ForegroundColor Green
