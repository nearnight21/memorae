[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory)] [string]$SecretRoot,
  [ValidateSet('Full', 'Client', 'Web', 'App', 'Server')] [string]$Profile = 'Full',
  [string]$RepositoryRoot = '',
  [switch]$InstallSsh,
  [switch]$Force,
  [switch]$TestSsh
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = if ($RepositoryRoot) {
  (Resolve-Path $RepositoryRoot).Path
} else {
  (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
$secrets = (Resolve-Path $SecretRoot).Path
$pathComparison = if ($env:OS -eq 'Windows_NT') {
  [StringComparison]::OrdinalIgnoreCase
} else {
  [StringComparison]::Ordinal
}
$rootPrefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if ($secrets.Equals($root, $pathComparison) -or $secrets.StartsWith($rootPrefix, $pathComparison)) {
  throw 'SecretRoot must stay outside the Memorae repository.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$utf8NoBom = New-Object Text.UTF8Encoding($false)

function Assert-RequiredEnvironmentVariables {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string[]]$Names
  )

  $states = @{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $name = $Matches[1]
      $value = $Matches[2]
      $states[$name] = -not [string]::IsNullOrWhiteSpace($value)
    }
  }
  $missing = @($Names | Where-Object { -not $states.ContainsKey($_) -or -not $states[$_] })
  if ($missing.Count -gt 0) {
    throw "Configuration file $Path has empty or missing required variables: $($missing -join ', ')"
  }
}

function Assert-IgnoredTarget {
  param([Parameter(Mandatory)] [string]$RelativePath)

  & git -C $root check-ignore --quiet -- $RelativePath
  if ($LASTEXITCODE -ne 0) {
    throw "Refusing to install a configuration file that Git does not ignore: $RelativePath"
  }
}

function Get-FileSha256 {
  param([Parameter(Mandatory)] [string]$Path)

  $stream = [IO.File]::OpenRead($Path)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

function Install-ProtectedFile {
  param(
    [Parameter(Mandatory)] [string]$Source,
    [Parameter(Mandatory)] [string]$Destination,
    [Parameter(Mandatory)] [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
    throw "Required source file is missing: $Source"
  }
  $destinationParent = Split-Path -Parent $Destination
  if (-not (Test-Path -LiteralPath $destinationParent)) {
    if ($PSCmdlet.ShouldProcess($destinationParent, 'Create directory')) {
      New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    }
  }

  if (Test-Path -LiteralPath $Destination) {
    $sourceHash = Get-FileSha256 -Path $Source
    $destinationHash = Get-FileSha256 -Path $Destination
    if ($sourceHash -eq $destinationHash) {
      Write-Host "$Label is already current."
      return
    }
    if (-not $Force) {
      throw "$Label already exists with different content. Re-run with -Force to back it up and replace it."
    }
    $backup = "$Destination.memorae-backup-$timestamp"
    if ($PSCmdlet.ShouldProcess($Destination, "Back up to $backup")) {
      Copy-Item -LiteralPath $Destination -Destination $backup
    }
  }

  if ($PSCmdlet.ShouldProcess($Destination, "Install $Label")) {
    Copy-Item -LiteralPath $Source -Destination $Destination -Force:$Force
    Write-Host "$Label installed."
  }
}

function Install-SshConfigBlock {
  param([Parameter(Mandatory)] [string]$SshDirectory)

  $configPath = Join-Path $SshDirectory 'config'
  $beginMarker = '# BEGIN MEMORAE MANAGED'
  $endMarker = '# END MEMORAE MANAGED'
  $block = @(
    $beginMarker,
    'Host memorae-prod',
    '    HostName 47.100.220.140',
    '    User admin',
    '    IdentityFile ~/.ssh/memorae_ed25519',
    '    IdentitiesOnly yes',
    $endMarker
  ) -join "`r`n"
  $current = if (Test-Path -LiteralPath $configPath) {
    Get-Content -LiteralPath $configPath -Raw -Encoding UTF8
  } else {
    ''
  }
  $pattern = '(?ms)^# BEGIN MEMORAE MANAGED\r?\n.*?^# END MEMORAE MANAGED\r?\n?'
  if ($current -match $pattern) {
    $updated = [regex]::Replace($current, $pattern, "$block`r`n")
  } elseif ([string]::IsNullOrWhiteSpace($current)) {
    $updated = "$block`r`n"
  } else {
    $updated = $current.TrimEnd() + "`r`n`r`n$block`r`n"
  }
  if ($updated -eq $current) {
    Write-Host 'SSH alias is already current.'
    return
  }

  if (Test-Path -LiteralPath $configPath) {
    $backup = "$configPath.memorae-backup-$timestamp"
    if ($PSCmdlet.ShouldProcess($configPath, "Back up to $backup")) {
      Copy-Item -LiteralPath $configPath -Destination $backup
    }
  }
  if ($PSCmdlet.ShouldProcess($configPath, 'Install memorae-prod SSH alias')) {
    [IO.File]::WriteAllText($configPath, $updated, $utf8NoBom)
    Write-Host 'SSH alias installed.'
  }
}

$definitions = @{
  Web = @{
    Source = 'config/web.env.local'
    Target = 'web/.env.local'
    Required = @(
      'VITE_MEMORY_RECALL_API_URL',
      'VITE_MEMORY_RECALL_AMAP_JS_API_KEY',
      'VITE_MEMORY_RECALL_AMAP_JS_SECURITY_CODE'
    )
  }
  App = @{
    Source = 'config/app.env.local'
    Target = 'app/.env.local'
    Required = @(
      'EXPO_PUBLIC_MEMORY_RECALL_API_URL',
      'EXPO_PUBLIC_AMAP_WEB_KEY',
      'EXPO_PUBLIC_AMAP_WEB_SECURITY_CODE'
    )
  }
  Server = @{
    Source = 'config/server.deploy.env'
    Target = 'server/deploy/.env'
    Required = @(
      'MEMORY_RECALL_POSTGRES_PASSWORD',
      'MEMORY_RECALL_DATABASE_URL',
      'MEMORY_RECALL_SESSION_TOKEN_PEPPER',
      'MEMORY_RECALL_ALLOWED_ORIGINS',
      'MEMORY_RECALL_COS_BUCKET',
      'MEMORY_RECALL_COS_REGION',
      'MEMORY_RECALL_COS_SECRET_ID',
      'MEMORY_RECALL_COS_SECRET_KEY',
      'MEMORY_RECALL_AMAP_WEB_SERVICE_KEY'
    )
  }
}

$selected = switch ($Profile) {
  'Full' { @('Web', 'App', 'Server') }
  'Client' { @('Web', 'App') }
  'Web' { @('Web') }
  'App' { @('App') }
  'Server' { @('Server') }
}

foreach ($name in $selected) {
  $definition = $definitions[$name]
  $source = Join-Path $secrets $definition.Source
  $target = Join-Path $root $definition.Target
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Required $name configuration is missing: $source"
  }
  Assert-RequiredEnvironmentVariables -Path $source -Names $definition.Required
  Assert-IgnoredTarget -RelativePath $definition.Target
  Install-ProtectedFile -Source $source -Destination $target -Label "$name configuration"
}

$includeSsh = $InstallSsh -or $Profile -in @('Full', 'Server')
if ($includeSsh) {
  $sshSourceDirectory = Join-Path $secrets 'ssh'
  $privateSource = Join-Path $sshSourceDirectory 'id_ed25519'
  $publicSource = Join-Path $sshSourceDirectory 'id_ed25519.pub'
  $sshTargetDirectory = Join-Path $env:USERPROFILE '.ssh'
  $privateTarget = Join-Path $sshTargetDirectory 'memorae_ed25519'
  $publicTarget = Join-Path $sshTargetDirectory 'memorae_ed25519.pub'

  Install-ProtectedFile -Source $privateSource -Destination $privateTarget -Label 'Memorae SSH private key'
  if (Test-Path -LiteralPath $publicSource -PathType Leaf) {
    Install-ProtectedFile -Source $publicSource -Destination $publicTarget -Label 'Memorae SSH public key'
  }
  Install-SshConfigBlock -SshDirectory $sshTargetDirectory

  if ($env:OS -eq 'Windows_NT' -and (Test-Path -LiteralPath $privateTarget) -and -not $WhatIfPreference) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $privateTarget '/inheritance:r' '/grant:r' "${identity}:(R)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to restrict the Memorae SSH private-key ACL.'
    }
  }

  if ($TestSsh -and -not $WhatIfPreference) {
    & ssh -o BatchMode=yes -o ConnectTimeout=8 memorae-prod "printf 'SSH_OK\n'"
    if ($LASTEXITCODE -ne 0) {
      throw 'Memorae SSH verification failed.'
    }
  }
}

Write-Host "Memorae local configuration restore completed for profile $Profile."
