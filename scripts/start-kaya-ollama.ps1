$ErrorActionPreference = 'Stop'
$kayaRoot = Split-Path -Parent $PSScriptRoot
$kayaRuntime = Join-Path $kayaRoot '.kaya-runtime'
$kayaExe = Join-Path $kayaRuntime 'ollama/ollama.exe'
if (!(Test-Path -LiteralPath $kayaExe)) { throw 'Run scripts/setup-kaya.ps1 first.' }
$kayaManifest = Get-Content -LiteralPath (Join-Path $kayaRoot 'extension/manifest.json') -Raw | ConvertFrom-Json
$kayaHash = [System.Security.Cryptography.SHA256]::Create().ComputeHash([Convert]::FromBase64String($kayaManifest.key))
$kayaId = -join ($kayaHash[0..15] | ForEach-Object { [char](97 + ($_ -shr 4)); [char](97 + ($_ -band 15)) })
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_ORIGINS = "chrome-extension://$kayaId"
$env:OLLAMA_MODELS = Join-Path $kayaRuntime 'models'
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_NUM_PARALLEL = '1'
$kayaRunning = $false
try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 2 | Out-Null; $kayaRunning = $true } catch {}
if ($kayaRunning) {
    Write-Output 'Ollama is already running. Its current model store and origin settings are unchanged.'
    Write-Output "If Chrome reports blocked access, restart that Ollama server with OLLAMA_ORIGINS=chrome-extension://$kayaId"
    return
}
$kayaProcess = Start-Process -FilePath $kayaExe -ArgumentList 'serve' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $kayaRuntime 'ollama.stdout.log') -RedirectStandardError (Join-Path $kayaRuntime 'ollama.stderr.log')
$kayaProcess.Id | Set-Content -LiteralPath (Join-Path $kayaRuntime 'ollama.pid')
for ($kayaAttempt = 0; $kayaAttempt -lt 60; $kayaAttempt++) {
    Start-Sleep -Milliseconds 500
    try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 1 | Out-Null; Write-Output "Ollama started locally for Kaya Mode ($kayaId)."; return } catch {}
}
throw 'Ollama did not start. See .kaya-runtime/ollama.stderr.log.'
