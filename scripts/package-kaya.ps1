$ErrorActionPreference = 'Stop'
$kayaRoot = Split-Path -Parent $PSScriptRoot
$kayaSource = Join-Path $kayaRoot 'extension'
$kayaOutput = Join-Path $kayaRoot 'test-results'
New-Item -ItemType Directory -Path $kayaOutput -Force | Out-Null
$kayaManifest = Get-Content -LiteralPath (Join-Path $kayaSource 'manifest.json') -Raw | ConvertFrom-Json
$kayaZip = Join-Path $kayaOutput "kaya-mode-$($kayaManifest.version).zip"
Push-Location $kayaSource
try {
    Compress-Archive -Path @('*.js', '*.html', '*.css', 'manifest.json', 'vendor') -DestinationPath $kayaZip -Force
} finally {
    Pop-Location
}
Write-Output "Extension-only package: $kayaZip"
Write-Output 'Extract the ZIP into a folder, then use Load unpacked. Local Ollama setup remains required.'
