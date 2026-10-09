$ErrorActionPreference = 'Stop'
$kayaRoot = Split-Path -Parent $PSScriptRoot
$kayaSource = Join-Path $kayaRoot 'extension'
$kayaOutput = Join-Path $kayaRoot 'test-results'
New-Item -ItemType Directory -Path $kayaOutput -Force | Out-Null
$kayaManifest = Get-Content -LiteralPath (Join-Path $kayaSource 'manifest.json') -Raw | ConvertFrom-Json
$kayaFiles = Get-ChildItem -LiteralPath $kayaSource -File | Where-Object {
    $_.Extension -in '.js', '.html', '.css' -or $_.Name -eq 'manifest.json'
}
$kayaZip = Join-Path $kayaOutput "kaya-mode-$($kayaManifest.version).zip"
Compress-Archive -LiteralPath $kayaFiles.FullName -DestinationPath $kayaZip -Force
Write-Output "Extension-only package: $kayaZip"
Write-Output 'Extract the ZIP into a folder, then use Load unpacked. Local Ollama setup remains required.'
