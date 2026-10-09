param([switch]$SkipDownload)
$ErrorActionPreference = 'Stop'
$kayaRoot = Split-Path -Parent $PSScriptRoot
$kayaRuntime = Join-Path $kayaRoot '.kaya-runtime'
$kayaExe = Join-Path $kayaRuntime 'ollama/ollama.exe'
New-Item -ItemType Directory -Path $kayaRuntime -Force | Out-Null
if (!(Test-Path -LiteralPath $kayaExe)) {
    if ($SkipDownload) { throw 'Ollama is missing. Run this script without -SkipDownload.' }
    $kayaVersion = 'v0.40.2'
    $kayaBase = "https://github.com/ollama/ollama/releases/download/$kayaVersion"
    $kayaZip = Join-Path $kayaRuntime 'ollama-windows-amd64.zip'
    $kayaChecksums = Join-Path $kayaRuntime 'sha256sum.txt'
    Write-Output 'Downloading the official Ollama runtime (about 1.5 GB)...'
    & curl.exe --fail --location --silent --show-error --retry 2 "$kayaBase/ollama-windows-amd64.zip" --output $kayaZip
    if ($LASTEXITCODE -ne 0) { throw 'Ollama download failed.' }
    & curl.exe --fail --location --silent --show-error "$kayaBase/sha256sum.txt" --output $kayaChecksums
    if ($LASTEXITCODE -ne 0) { throw 'Checksum download failed.' }
    $kayaExpected = ((Get-Content -LiteralPath $kayaChecksums | Where-Object { $_ -match 'ollama-windows-amd64.zip$' }) -split '\s+')[0]
    if ((Get-FileHash -LiteralPath $kayaZip -Algorithm SHA256).Hash -ne $kayaExpected) { throw 'Checksum mismatch. Runtime was not installed.' }
    Expand-Archive -LiteralPath $kayaZip -DestinationPath (Join-Path $kayaRuntime 'ollama') -Force
}
& (Join-Path $PSScriptRoot 'start-kaya-ollama.ps1')
Write-Output 'Downloading qwen2.5:3b if missing (about 1.9 GB)...'
$kayaPull = Start-Process -FilePath $kayaExe -ArgumentList @('pull', 'qwen2.5:3b') -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $kayaRuntime 'model-pull.stdout.log') -RedirectStandardError (Join-Path $kayaRuntime 'model-pull.log')
if ($kayaPull.ExitCode -ne 0) { throw 'Model download failed. See .kaya-runtime/model-pull.log.' }
Write-Output 'Warming up the local model...'
$kayaBody = @{ model = 'qwen2.5:3b'; stream = $false; keep_alive = '10m' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/generate' -Method Post -ContentType 'application/json' -Body $kayaBody -TimeoutSec 180 | Out-Null
Write-Output 'Local AI is ready. Load extension/ in Chrome, then run: node scripts/serve-kaya-demo.mjs'
