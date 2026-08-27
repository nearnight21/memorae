[CmdletBinding()]
param(
  [string]$SourceRepository = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$devEnvironment = 'D:\DevTools\Use-DevEnvironment.ps1'
if (Test-Path -LiteralPath $devEnvironment) {
  . $devEnvironment
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory)] [string]$FilePath,
    [Parameter(Mandatory)] [string[]]$ArgumentList,
    [Parameter(Mandatory)] [string]$WorkingDirectory
  )
  Push-Location -LiteralPath $WorkingDirectory
  try {
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed ($LASTEXITCODE): $FilePath $($ArgumentList -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

$source = if ($SourceRepository) {
  (Resolve-Path $SourceRepository).Path
} else {
  (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
$status = (& git -C $source status --porcelain) -join "`n"
if ($status.Trim()) { throw 'Source worktree must be clean before fresh-clone verification.' }

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "memorae-fresh-$([guid]::NewGuid().ToString('N'))"
$clone = Join-Path $tempRoot 'memorae'
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

$serverProcess = $null
try {
  Invoke-Checked -FilePath 'git' -ArgumentList @('clone', '--no-local', '--branch', 'main', $source, $clone) -WorkingDirectory $tempRoot

  Copy-Item -LiteralPath (Join-Path $clone 'web/.env.example') -Destination (Join-Path $clone 'web/.env.local')
  Copy-Item -LiteralPath (Join-Path $clone 'app/.env.example') -Destination (Join-Path $clone 'app/.env.local')

  Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('ci') -WorkingDirectory (Join-Path $clone 'web')
  Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('run', 'verify') -WorkingDirectory (Join-Path $clone 'web')

  Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('ci') -WorkingDirectory (Join-Path $clone 'app')
  Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('run', 'verify') -WorkingDirectory (Join-Path $clone 'app')

  Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('ci') -WorkingDirectory (Join-Path $clone 'server')
  Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('run', 'verify') -WorkingDirectory (Join-Path $clone 'server')
  Invoke-Checked -FilePath 'powershell.exe' -ArgumentList @('-ExecutionPolicy', 'Bypass', '-File', (Join-Path $clone 'scripts/check-runtime-boundaries.ps1')) -WorkingDirectory $clone
  foreach ($name in @(
    'MEMORY_RECALL_DATABASE_URL', 'MEMORY_RECALL_SESSION_TOKEN_PEPPER',
    'MEMORY_RECALL_ALLOWED_ORIGINS', 'MEMORY_RECALL_LISTEN_HOST',
    'MEMORY_RECALL_COS_BUCKET', 'MEMORY_RECALL_COS_REGION',
    'MEMORY_RECALL_COS_SECRET_ID', 'MEMORY_RECALL_COS_SECRET_KEY',
    'MEMORY_RECALL_AMAP_WEB_SERVICE_KEY'
  )) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  $env:MEMORY_RECALL_LOCAL_TOKEN = 'fresh-clone-local-token-1234'
  $env:MEMORY_RECALL_PORT = '18878'
  $env:MEMORY_RECALL_DATA_FILE = (Join-Path $clone 'server/.local-data/fresh-clone.json')
  $env:MEMORY_RECALL_ALLOWED_ORIGINS = 'http://127.0.0.1:3000'
  $serverOutput = Join-Path $tempRoot 'server.log'
  $serverError = Join-Path $tempRoot 'server.err.log'
  $serverProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'start') -WorkingDirectory (Join-Path $clone 'server') -RedirectStandardOutput $serverOutput -RedirectStandardError $serverError -PassThru

  $healthy = $false
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    try {
      $response = Invoke-WebRequest -Uri 'http://127.0.0.1:18878/health' -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch {
      # The server may still be starting.
    }
  }
  if (-not $healthy) {
    $details = if (Test-Path $serverError) { Get-Content $serverError -Raw } else { '' }
    throw "Fresh-clone Server did not become healthy. $details"
  }

  $deployEnv = Join-Path $clone 'server/deploy/.env'
  Copy-Item -LiteralPath (Join-Path $clone 'server/deploy/.env.example') -Destination $deployEnv
  try {
    Invoke-Checked -FilePath 'docker' -ArgumentList @('compose', '-f', 'server/deploy/compose.yaml', 'config', '--quiet') -WorkingDirectory $clone
  } finally {
    Remove-Item -LiteralPath $deployEnv -Force
  }

  $trackedSecrets = & git -C $clone ls-files | Select-String -Pattern '(^|/)(\.env$|.*\.(jks|keystore|p12|pem|key))$'
  if ($trackedSecrets) { throw "Fresh clone contains tracked credential material: $trackedSecrets" }

  $runtimeRefs = & git -C $clone grep -n -i -E 'projects/(thinkpad|camp-memories)|/srv/thinkpad(/projects/memorae)?|MEMORY_RECALL_ENV_FILE' -- server app web .github 2>$null
  if ($LASTEXITCODE -eq 0 -and $runtimeRefs) { throw "Fresh clone contains cross-repository runtime references:`n$runtimeRefs" }

  Write-Host "Fresh-clone verification succeeded: $clone"
} finally {
  Remove-Item Env:MEMORY_RECALL_LOCAL_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:MEMORY_RECALL_PORT -ErrorAction SilentlyContinue
  Remove-Item Env:MEMORY_RECALL_DATA_FILE -ErrorAction SilentlyContinue
  Remove-Item Env:MEMORY_RECALL_ALLOWED_ORIGINS -ErrorAction SilentlyContinue
  Remove-Item Env:MEMORY_RECALL_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:MEMORY_RECALL_SESSION_TOKEN_PEPPER -ErrorAction SilentlyContinue
  Remove-Item Env:MEMORY_RECALL_LISTEN_HOST -ErrorAction SilentlyContinue
  Remove-Item Env:MEMORY_RECALL_COS_BUCKET -ErrorAction SilentlyContinue
  Remove-Item Env:MEMORY_RECALL_COS_REGION -ErrorAction SilentlyContinue
  Remove-Item Env:MEMORY_RECALL_COS_SECRET_ID -ErrorAction SilentlyContinue
  Remove-Item Env:MEMORY_RECALL_COS_SECRET_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:MEMORY_RECALL_AMAP_WEB_SERVICE_KEY -ErrorAction SilentlyContinue
  if ($serverProcess -and -not $serverProcess.HasExited) {
    & taskkill.exe /PID $serverProcess.Id /T /F 2>$null | Out-Null
  }
  if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
