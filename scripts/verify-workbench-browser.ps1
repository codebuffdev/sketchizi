$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ServerScript = Join-Path $PSScriptRoot 'workbench-browser-test-server.mjs'
$SmokeUrl = 'http://127.0.0.1:8765/tests/browser/workbench-persistence-smoke.html'
$StatusUrl = 'http://127.0.0.1:8765/__status'

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCommand) { throw 'Node.js was not found. Install Node.js 18 or later, then rerun this script.' }

$Existing = $null
try { $Existing = [System.Net.Sockets.TcpClient]::new('127.0.0.1', 8765); $Existing.Close() } catch {}
if ($Existing) { throw 'Port 8765 is already in use. Stop the process using it, then retry.' }

$Server = $null
$RunExitCode = $null
try {
  $Server = Start-Process -FilePath $NodeCommand.Source -ArgumentList @('"' + $ServerScript + '"') -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden
  $Ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    if ($Server.HasExited) { throw "The local test server exited early (code $($Server.ExitCode))." }
    try {
      $null = Invoke-RestMethod -Uri $StatusUrl -Method Get -TimeoutSec 2
      $Ready = $true
      break
    } catch {}
  }
  if (-not $Ready) { throw 'The local test server did not become ready on 127.0.0.1:8765.' }

  Write-Host ''
  Write-Host 'Opening isolated Workbench persistence test:' -ForegroundColor Cyan
  Write-Host $SmokeUrl
  Write-Host 'The runner will wait for an automatic PASS/FAIL report from the page.'
  Write-Host 'This uses 127.0.0.1:8765 storage, separate from the usual Sketchizi origin.'
  Start-Process $SmokeUrl

  $Deadline = (Get-Date).AddSeconds(180)
  $Completed = $false
  while ((Get-Date) -lt $Deadline) {
    if ($Server.HasExited) { throw 'The local test server exited while the browser test was running.' }
    try {
      $Status = Invoke-RestMethod -Uri $StatusUrl -Method Get -TimeoutSec 2
      if ($Status.done -and $Status.result) {
        $Completed = $true
        Write-Host ''
        foreach ($Line in $Status.result.results) {
          if ($Line.StartsWith('PASS')) { Write-Host $Line -ForegroundColor Green }
          elseif ($Line.StartsWith('FAIL')) { Write-Host $Line -ForegroundColor Red }
          else { Write-Host $Line }
        }
        $RunExitCode = if ($Status.result.status -eq 'passed') { 0 } else { 1 }
        break
      }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $Completed) {
    throw 'Timed out waiting 180 seconds for the browser result. Confirm your browser opened the test page and JavaScript is enabled.'
  }
} finally {
  if ($Server -and -not $Server.HasExited) {
    Stop-Process -Id $Server.Id -Force -ErrorAction SilentlyContinue
  }
}

if ($RunExitCode -eq 0) {
  Write-Host "`nPASS — browser reload and simulation-history test" -ForegroundColor Green
} else {
  Write-Host "`nFAIL — browser reload and simulation-history test" -ForegroundColor Red
}
exit $RunExitCode
