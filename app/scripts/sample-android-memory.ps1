[CmdletBinding()]
param(
  [string]$PackageName = 'com.memorae.cn',
  [string]$DeviceSerial = '',
  [ValidateRange(1, 3600)]
  [int]$IntervalSeconds = 5,
  [ValidateRange(1, 100000)]
  [int]$Samples = 12,
  [string]$OutputPath = ''
)

$adb = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adb) {
  throw '找不到 adb，请先安装 Android SDK Platform-Tools 并把 adb 加入 PATH。'
}

$devices = @(adb devices | Select-String -Pattern "`tdevice$")
if ($devices.Count -eq 0) {
  throw '没有检测到处于 device 状态的 Android 设备。'
}
if ($devices.Count -gt 1 -and [string]::IsNullOrWhiteSpace($DeviceSerial)) {
  throw '检测到多个 Android 设备，请通过 -DeviceSerial 指定目标设备。'
}
$adbArgs = if ([string]::IsNullOrWhiteSpace($DeviceSerial)) { @() } else { @('-s', $DeviceSerial) }

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $OutputPath = Join-Path (Get-Location) "android-memory-$stamp.csv"
}

$rows = [System.Collections.Generic.List[object]]::new()
for ($index = 1; $index -le $Samples; $index += 1) {
  $capturedAt = (Get-Date).ToString('o')
  $dump = @(& adb @adbArgs shell dumpsys meminfo $PackageName 2>$null)
  if ($LASTEXITCODE -ne 0 -or $dump.Count -eq 0) {
    throw "无法读取 $PackageName 的 dumpsys meminfo。请确认 App 正在运行。"
  }

  $totalPssKb = $null
  $nativeHeapKb = $null
  $dalvikHeapKb = $null
  foreach ($line in $dump) {
    if ($line -match '^\s*TOTAL\s+(\d+)\b') { $totalPssKb = [int64]$Matches[1] }
    if ($line -match '^\s*Native Heap\s+(\d+)\b') { $nativeHeapKb = [int64]$Matches[1] }
    if ($line -match '^\s*Dalvik Heap\s+(\d+)\b') { $dalvikHeapKb = [int64]$Matches[1] }
  }

  if ($null -eq $totalPssKb) {
    throw "dumpsys meminfo 未返回 $PackageName 的 TOTAL PSS。"
  }

  $row = [pscustomobject]@{
    capturedAt = $capturedAt
    sample = $index
    packageName = $PackageName
    totalPssKb = $totalPssKb
    nativeHeapKb = $nativeHeapKb
    dalvikHeapKb = $dalvikHeapKb
  }
  $rows.Add($row)
  Write-Host ("[{0}/{1}] PSS {2} KiB，Native {3} KiB，Dalvik {4} KiB" -f $index, $Samples, $totalPssKb, $nativeHeapKb, $dalvikHeapKb)

  if ($index -lt $Samples) { Start-Sleep -Seconds $IntervalSeconds }
}

$rows | Export-Csv -LiteralPath $OutputPath -NoTypeInformation -Encoding utf8
$peak = ($rows | Measure-Object -Property totalPssKb -Maximum).Maximum
Write-Host "已写入 $OutputPath；采样期间最高 PSS 为 $peak KiB。"
