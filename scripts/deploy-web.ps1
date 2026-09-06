[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)] [string]$SshKey,
  [string]$HostName = '47.100.220.140',
  [string]$UserName = 'admin',
  [string]$WebDist = (Join-Path $PSScriptRoot '..\web\dist'),
  [string]$RemoteRoot = '/var/www/memorae'
)

$ErrorActionPreference = 'Stop'
. D:\DevTools\Use-DevEnvironment.ps1

$resolvedDist = (Resolve-Path -LiteralPath $WebDist).Path
if (-not (Test-Path (Join-Path $resolvedDist 'index.html'))) { throw "Web dist is missing index.html: $resolvedDist" }
if ($RemoteRoot -ne '/var/www/memorae') { throw 'RemoteRoot is fixed to /var/www/memorae to protect sibling sites.' }

$target = "$UserName@$HostName"
$remoteStage = "$RemoteRoot/.deploy-stage-$([guid]::NewGuid().ToString('N'))"
$sshArgs = @('-i', $SshKey, '-o', 'BatchMode=yes', $target)

if ($PSCmdlet.ShouldProcess($target, 'Deploy Web dist while preserving /thinkpad')) {
  & ssh @sshArgs "set -e; test -d '$RemoteRoot'; test -d '$RemoteRoot/thinkpad'; mkdir '$remoteStage'"
  & scp -i $SshKey -r (Join-Path $resolvedDist '*') "$target`:$remoteStage/"
  & ssh @sshArgs "set -e; for item in '$remoteStage'/* '$remoteStage'/.[!.]*; do [ -e \`$item ] || continue; base=\`$(basename \"\`$item\"); case \"\`$base\" in thinkpad) exit 20;; esac; rm -rf '$RemoteRoot'/\"\`$base\"; mv \"\`$item\" '$RemoteRoot'/\"\`$base\"; done; rmdir '$remoteStage'; test -f '$RemoteRoot/thinkpad/index.html'"
  & ssh @sshArgs "set -e; curl -fsS -o /dev/null https://memorae.cn/; curl -fsS -o /dev/null https://memorae.cn/thinkpad/; curl -fsS -o /dev/null https://memorae.cn/health"
}
