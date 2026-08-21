param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\src\map\generated\overseasCityData.ts')
)

$temporaryId = [Guid]::NewGuid().ToString('N')
$zipPath = Join-Path ([System.IO.Path]::GetTempPath()) "geonames-cities15000-$temporaryId.zip"
$extractPath = Join-Path ([System.IO.Path]::GetTempPath()) "geonames-cities15000-$temporaryId"

try {
  Invoke-WebRequest `
    -Uri 'https://download.geonames.org/export/dump/cities15000.zip' `
    -OutFile $zipPath
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath

  $scriptPath = Join-Path $PSScriptRoot 'build-overseas-city-data.mjs'
  node $scriptPath (Join-Path $extractPath 'cities15000.txt') $OutputPath
} finally {
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $extractPath -Recurse -Force -ErrorAction SilentlyContinue
}
