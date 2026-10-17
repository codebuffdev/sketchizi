$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SmokeUrl = 'http://127.0.0.1:8765/tests/browser/workbench-persistence-smoke.html'

$PythonCommand = Get-Command python -ErrorAction SilentlyContinue
$PythonExe = if ($PythonCommand) { $PythonCommand.Source } else { $null }
if (-not $PythonExe) {
  $PyCommand = Get-Command py -ErrorAction SilentlyContinue
  if ($PyCommand) { $PythonExe = $PyCommand.Source }
}
if (-not $PythonExe) {
  Write-Error 'Python was not found. Install Python 3 or run the equivalent command manually: python -m http.server 8765 --bind 127.0.0.1'
}

$PythonArgs = if ([System.IO.Path]::GetFileNameWithoutExtension($PythonExe) -eq 'py') {
  "-3 -m http.server 8765 --bind 127.0.0.1 --directory `"$ProjectRoot`""
} else {
  "-m http.server 8765 --bind 127.0.0.1 --directory `"$ProjectRoot`""
}
$Server = $null
try {
  $Existing = $null
  try { $Existing = [System.Net.Sockets.TcpClient]::new('127.0.0.1', 8765); $Existing.Close() } catch {}
  if ($Existing) { throw 'Port 8765 is already in use. Stop the process using it, then retry.' }

  $Server = Start-Process -FilePath $PythonExe -ArgumentList $PythonArgs -PassThru -WindowStyle Hidden
  $Ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    if ($Server.HasExited) { throw "The local test server exited early (code $($Server.ExitCode))." }
    try {
      $Client = [System.Net.Sockets.TcpClient]::new('127.0.0.1', 8765)
      $Client.Close()
      $Ready = $true
      break
    } catch {}
  }
  if (-not $Ready) { throw 'The test server did not become ready on 127.0.0.1:8765.' }

  Write-Host ''
  Write-Host 'Opening isolated Workbench persistence test:' -ForegroundColor Cyan
  Write-Host $SmokeUrl
  Write-Host 'Wait for the page to reload and show PASS — real Chromium reload persistence test.'
  Write-Host 'This uses the localhost:8765 storage origin, separate from Sketchizi at localhost:5173.'
  Write-Host 'Do not clear browser data while the test is running.'
  Start-Process $SmokeUrl
  Write-Host ''
  [void](Read-Host 'After reading the browser result, press Enter here to stop the test server')
} finally {
  if ($Server -and -not $Server.HasExited) {
    Stop-Process -Id $Server.Id -Force -ErrorAction SilentlyContinue
  }
}
