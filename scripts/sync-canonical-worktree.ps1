[CmdletBinding()]
param(
  [string]$CanonicalBranch = 'main'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$remoteBranch = "origin/$CanonicalBranch"

function Get-GitText {
  param([Parameter(Mandatory)] [string[]]$Arguments)
  $result = & git -C $repositoryRoot @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Git command failed: git -C $repositoryRoot $($Arguments -join ' ')" }
  return ($result -join "`n").Trim()
}

function Invoke-Git {
  param([Parameter(Mandatory)] [string[]]$Arguments)
  & git -C $repositoryRoot @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Git command failed: git -C $repositoryRoot $($Arguments -join ' ')" }
}

function Test-GitAncestor {
  param([Parameter(Mandatory)] [string]$Ancestor, [Parameter(Mandatory)] [string]$Descendant)
  & git -C $repositoryRoot merge-base --is-ancestor $Ancestor $Descendant
  return $LASTEXITCODE -eq 0
}

$branch = Get-GitText -Arguments @('branch', '--show-current')
if (-not $branch) { throw 'Detached HEAD is not supported. Synchronization stopped.' }
if (Get-GitText -Arguments @('status', '--porcelain')) { throw 'Worktree has uncommitted or untracked files. Synchronization stopped.' }
if (-not (Get-GitText -Arguments @('remote', 'get-url', 'origin'))) { throw 'Remote origin is not configured. Synchronization stopped.' }

Invoke-Git -Arguments @('fetch', '--prune', 'origin')
$localHead = Get-GitText -Arguments @('rev-parse', 'HEAD')
& git -C $repositoryRoot show-ref --verify --quiet "refs/remotes/$remoteBranch"
if ($LASTEXITCODE -ne 0) { throw "Remote branch $remoteBranch does not exist. Synchronization stopped." }
$remoteHead = Get-GitText -Arguments @('rev-parse', $remoteBranch)

if ($branch -eq $CanonicalBranch) {
  if ($localHead -eq $remoteHead) {
    Write-Host "Synchronization succeeded: $CanonicalBranch is current."
  } elseif (Test-GitAncestor -Ancestor $localHead -Descendant $remoteHead) {
    Invoke-Git -Arguments @('merge', '--ff-only', $remoteBranch)
    Write-Host "Synchronization succeeded: $CanonicalBranch was fast-forwarded."
  } else {
    $relation = if (Test-GitAncestor -Ancestor $remoteHead -Descendant $localHead) { 'ahead of origin' } else { 'diverged from origin' }
    throw "$CanonicalBranch is ${relation}. Synchronization stopped without changing history."
  }
  exit 0
}

if (-not (Test-GitAncestor -Ancestor $remoteHead -Descendant $localHead)) {
  throw "Feature branch $branch does not contain the latest $remoteBranch. Merge the canonical branch into it before editing."
}

$upstream = Get-GitText -Arguments @('for-each-ref', '--format=%(upstream:short)', "refs/heads/$branch")
if ($upstream) {
  & git -C $repositoryRoot show-ref --verify --quiet "refs/remotes/$upstream"
  if ($LASTEXITCODE -ne 0) { throw "Upstream branch $upstream does not exist. Synchronization stopped." }
  $upstreamHead = Get-GitText -Arguments @('rev-parse', $upstream)
  if (-not (Test-GitAncestor -Ancestor $upstreamHead -Descendant $localHead)) {
    throw "Feature branch $branch is behind or diverged from $upstream. Synchronization stopped without changing history."
  }
}

Write-Host "Synchronization check succeeded: feature branch $branch contains the latest $remoteBranch and is ready for development."
