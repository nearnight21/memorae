[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$SshKey = '',
  [string]$HostName = '47.100.220.140',
  [string]$UserName = 'admin',
  [string]$WebDist = '',
  [string]$RemoteRoot = '/var/www/memorae'
)

$ErrorActionPreference = 'Stop'
$devEnvironment = 'D:\DevTools\Use-DevEnvironment.ps1'
if (Test-Path -LiteralPath $devEnvironment) {
  . $devEnvironment
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $SshKey) {
  $candidateKeys = @(
    (Join-Path $repoRoot '.local-data\id_ed25519'),
    (Join-Path $HOME '.ssh\memorae_ed25519'),
    (Join-Path $HOME '.ssh\id_ed25519')
  )
  foreach ($candidate in $candidateKeys) {
    if (Test-Path -LiteralPath $candidate) {
      if ($env:OS -eq 'Windows_NT' -and $candidate.StartsWith($repoRoot)) {
        try {
          & icacls.exe $candidate /inheritance:r /grant:r "$($env:USERNAME):(R)" | Out-Null
        } catch {}
      }
      $SshKey = $candidate
      break
    }
  }
}
if (-not $SshKey -or -not (Test-Path -LiteralPath $SshKey)) {
  throw "SSH key not found. Please provide -SshKey or place your key at ~/.ssh/id_ed25519 or .local-data/id_ed25519"
}

if (-not $WebDist) {
  $WebDist = Join-Path $PSScriptRoot '..\web\dist'
}

$resolvedDist = (Resolve-Path -LiteralPath $WebDist).Path
if (-not (Test-Path (Join-Path $resolvedDist 'index.html'))) { throw "Web dist is missing index.html: $resolvedDist" }
if ($RemoteRoot -ne '/var/www/memorae') { throw 'RemoteRoot is fixed to /var/www/memorae to protect sibling sites.' }

$target = "$UserName@$HostName"
$remoteStage = "$RemoteRoot/.deploy-stage-$([guid]::NewGuid().ToString('N'))"
$sshArgs = @('-i', $SshKey, '-o', 'BatchMode=yes', $target)

if ($PSCmdlet.ShouldProcess($target, 'Deploy Web dist while preserving /thinkpad')) {
  & ssh @sshArgs "set -e; test -d '$RemoteRoot'; test -d '$RemoteRoot/thinkpad'; mkdir '$remoteStage'"
  & scp -i $SshKey -r (Join-Path $resolvedDist '*') "$target`:$remoteStage/"

  $remoteScript = @'
set -e
shopt -s nullglob
stage="$1"
root="$2"
for item in "$stage"/* "$stage"/.[!.]*; do
  [ -e "$item" ] || continue
  base="$(basename "$item")"
  case "$base" in
    thinkpad)
      echo "Refusing to overwrite thinkpad directory" >&2
      exit 20
      ;;
  esac
  rm -rf "$root/$base"
  mv "$item" "$root/$base"
done
rmdir "$stage"
test -f "$root/thinkpad/index.html"
'@

  $remoteScript | & ssh @sshArgs "tr -d '\r' | bash -s -- '$remoteStage' '$RemoteRoot'"
  if ($LASTEXITCODE -ne 0) { throw "Remote deployment failed with exit code $LASTEXITCODE" }

  & ssh @sshArgs 'set -e; curl -fsS -o /dev/null https://memorae.cn/; curl -fsS -o /dev/null https://memorae.cn/thinkpad/; curl -fsS -o /dev/null https://memorae.cn/health'
}
