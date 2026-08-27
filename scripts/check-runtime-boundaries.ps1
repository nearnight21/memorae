[CmdletBinding()]
param(
  [string]$RepositoryRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = if ($RepositoryRoot) {
  (Resolve-Path $RepositoryRoot).Path
} else {
  (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
$requiredFiles = @(
  'web/.env.example',
  'app/.env.example',
  'server/.env.example',
  'server/deploy/.env.example',
  'server/deploy/compose.yaml',
  'server/deploy/Caddyfile',
  'app/app.json',
  'app/eas.json'
)
foreach ($relativePath in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $relativePath))) {
    throw "Required Memorae contract file is missing: $relativePath"
  }
}

$runtimeRoots = @('web/src', 'app/src', 'app/plugins', 'server/src', 'server/deploy', '.github')
$files = foreach ($relativeRoot in $runtimeRoots) {
  $path = Join-Path $root $relativeRoot
  if (Test-Path -LiteralPath $path) {
    Get-ChildItem -LiteralPath $path -Recurse -File | Where-Object {
      $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\build\\|\\.git\\'
    }
  }
}

$forbiddenPattern = '(?i)projects/(?:thinkpad|camp-memories)|/srv/thinkpad(?:/projects/memorae)?|MEMORY_RECALL_ENV_FILE|\.\./(?:thinkpad|camp-memories)'
$violations = foreach ($file in $files) {
  Select-String -LiteralPath $file.FullName -Pattern $forbiddenPattern
}
if ($violations) {
  $details = $violations | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
  throw "Cross-repository runtime references found:`n$($details -join "`n")"
}

$trackedCredentialFiles = & git -C $root ls-files | Select-String -Pattern '(^|/)(\.env$|.*\.(jks|keystore|p12|pem|key))$'
if ($trackedCredentialFiles) {
  throw "Tracked credential material found:`n$trackedCredentialFiles"
}

$webEnv = Get-Content -LiteralPath (Join-Path $root 'web/.env.example') -Raw
$appEnv = Get-Content -LiteralPath (Join-Path $root 'app/.env.example') -Raw
$serverEnv = Get-Content -LiteralPath (Join-Path $root 'server/.env.example') -Raw
$deployEnv = Get-Content -LiteralPath (Join-Path $root 'server/deploy/.env.example') -Raw
$requiredContracts = @(
  @{ Name = 'VITE_MEMORY_RECALL_API_URL'; Text = $webEnv },
  @{ Name = 'VITE_MEMORY_RECALL_AMAP_JS_API_KEY'; Text = $webEnv },
  @{ Name = 'VITE_MEMORY_RECALL_AMAP_JS_SECURITY_CODE'; Text = $webEnv },
  @{ Name = 'DISABLE_HMR'; Text = $webEnv },
  @{ Name = 'EXPO_PUBLIC_MEMORY_RECALL_API_URL'; Text = $appEnv },
  @{ Name = 'MEMORY_RECALL_AMAP_ANDROID_KEY'; Text = $appEnv },
  @{ Name = 'MEMORY_RECALL_ANDROID_KEYSTORE_PATH'; Text = $appEnv },
  @{ Name = 'EXPO_TOKEN'; Text = $appEnv },
  @{ Name = 'MEMORY_RECALL_LOCAL_TOKEN'; Text = $serverEnv },
  @{ Name = 'MEMORY_RECALL_DATABASE_URL'; Text = $serverEnv },
  @{ Name = 'MEMORY_RECALL_COS_SECRET_KEY'; Text = $serverEnv },
  @{ Name = 'MEMORY_RECALL_TEST_DATABASE_URL'; Text = $serverEnv },
  @{ Name = 'MEMORY_RECALL_POSTGRES_PASSWORD'; Text = $deployEnv },
  @{ Name = 'MEMORY_RECALL_PUBLIC_DOMAIN'; Text = $deployEnv },
  @{ Name = 'CADDY_EMAIL'; Text = $deployEnv }
)
foreach ($contract in $requiredContracts) {
  if ($contract.Text -notmatch "(?m)^\s*#?\s*$([regex]::Escape($contract.Name))\s*=") {
    throw "Environment template does not declare $($contract.Name)."
  }
}

Write-Host 'Runtime boundary check passed.'
