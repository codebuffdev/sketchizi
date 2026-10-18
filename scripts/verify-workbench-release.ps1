$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $ProjectRoot

function Invoke-ReleaseStep([string]$Label, [scriptblock]$Action) {
  Write-Host "`n=== $Label ===" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE. Fix the reported issue before continuing."
  }
  Write-Host "PASS — $Label" -ForegroundColor Green
}

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
$NpmCommand = Get-Command npm -ErrorAction SilentlyContinue
if (-not $NodeCommand) { throw 'Node.js was not found. Install Node.js 18 or later.' }
if (-not $NpmCommand) { throw 'npm was not found. Install Node.js with npm, then retry.' }

Invoke-ReleaseStep 'Install locked dependencies (npm ci)' { npm ci --no-audit --no-fund }
Invoke-ReleaseStep 'Production build' { npm run build }

# Existing application regression suites: keep these in the same gate as Workbench
# tests so a new Workbench increment cannot accidentally bypass core app coverage.
Invoke-ReleaseStep 'Networking rules' { npm run test:networking }
Invoke-ReleaseStep 'Architecture catalog' { npm run test:catalog }
Invoke-ReleaseStep 'Chat protocol' { npm run test:chat }
Invoke-ReleaseStep 'Collaboration synchronization' { npm run test:sync }
Invoke-ReleaseStep 'UI defaults' { npm run test:ui-defaults }
Invoke-ReleaseStep 'Authentication' { npm run test:auth }
Invoke-ReleaseStep 'AI client and gateway' { npm run test:ai }
Invoke-ReleaseStep 'Collaboration host authentication' { npm run test:collaboration-host-auth }
Invoke-ReleaseStep 'Device support' { npm run test:device }
Invoke-ReleaseStep 'Backend warmup' { npm run test:backend-warmup }
Invoke-ReleaseStep 'Recovery drafts' { npm run test:recovery }
Invoke-ReleaseStep 'Community gateway' { npm run test:community-gateway }
Invoke-ReleaseStep 'Font asset handling' { npm run test:font-assets }
Invoke-ReleaseStep 'Font family defaults' { npm run test:font-family-defaults }
Invoke-ReleaseStep 'Load-test import and calibration' { npm run test:load-test-calibration }
Invoke-ReleaseStep 'Simulation regression suite' { npm run test:simulation }
Invoke-ReleaseStep 'Workbench artifacts' { npm run test:workbench-artifacts }
Invoke-ReleaseStep 'Workbench format and persistence' { npm run test:workbench-format }
Invoke-ReleaseStep 'Infrastructure profiles' { npm run test:infrastructure-profiles }
Invoke-ReleaseStep 'Workbench UI/model' { npm run test:workbench-ui }
Invoke-ReleaseStep 'Workbench validation' { npm run test:workbench-validation }
Invoke-ReleaseStep 'Workbench POC journey' { npm run test:workbench-poc }
Invoke-ReleaseStep 'Browser verification fixture' { npm run test:browser-index-fixture }
Invoke-ReleaseStep 'Real-browser persistence smoke' { powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-workbench-browser.ps1') }

Write-Host "`nALL RELEASE-GATE STEPS PASSED." -ForegroundColor Green
Write-Host 'This verifies the listed build, regression, and browser smoke checks only; it does not certify production capacity or validate generated OpenAPI/SQL against external tools.'
