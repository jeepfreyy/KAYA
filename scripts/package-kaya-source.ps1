$ErrorActionPreference = 'Stop'
$kayaRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$kayaOutput = Join-Path $kayaRoot 'test-results'
New-Item -ItemType Directory -Path $kayaOutput -Force | Out-Null
$kayaFiles = @(
    Get-Item -LiteralPath (Join-Path $kayaRoot 'README.md'), (Join-Path $kayaRoot '.gitignore')
    foreach ($kayaArea in @('extension', 'demo', 'scripts', 'docs', '.github')) {
        Get-ChildItem -LiteralPath (Join-Path $kayaRoot $kayaArea) -Recurse -File -Force |
            Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) }
    }
)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$kayaZip = Join-Path $kayaOutput 'kaya-mode-source.zip'
$kayaStream = [IO.File]::Open($kayaZip, [IO.FileMode]::Create, [IO.FileAccess]::Write)
$kayaArchive = New-Object IO.Compression.ZipArchive($kayaStream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($kayaFile in $kayaFiles) {
        $kayaAbsolute = [IO.Path]::GetFullPath($kayaFile.FullName)
        if (!$kayaAbsolute.StartsWith($kayaRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Source escaped the project root.' }
        $kayaRelative = $kayaAbsolute.Substring($kayaRoot.Length + 1).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($kayaArchive, $kayaAbsolute, $kayaRelative) | Out-Null
    }
} finally { $kayaArchive.Dispose(); $kayaStream.Dispose() }
Write-Output "Clean Kaya source: $kayaZip"
Write-Output 'Contains source, docs, scripts, and tests. Excludes Git history, dependencies, model/runtime downloads, and test output.'
