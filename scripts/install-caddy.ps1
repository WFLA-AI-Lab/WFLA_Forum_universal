#requires -Version 5.1
<#
  下载 Caddy 官方 Windows x64 版本到本项目的 tools\caddy。
  只使用固定版本，并校验官方 SHA-256 文件。
#>
[CmdletBinding()]
param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
$caddyDir = Join-Path $root 'tools\caddy'
$caddyExe = Join-Path $caddyDir 'caddy.exe'
$version = 'v2.11.7'
$asset = 'caddy_2.11.7_windows_amd64.zip'
$base = "https://github.com/caddyserver/caddy/releases/download/$version"
$zip = Join-Path $env:TEMP $asset
$checksums = Join-Path $env:TEMP 'caddy_2.11.7_checksums.txt'
$ProgressPreference = 'SilentlyContinue'

if ($VerifyOnly) {
  if (-not (Test-Path -LiteralPath $caddyExe)) { throw "未找到 Caddy：$caddyExe" }
  & $caddyExe version
  exit $LASTEXITCODE
}
if ([Environment]::Is64BitOperatingSystem -eq $false) { throw 'This package installs the Windows x64 build of Caddy only.' }
if (Test-Path -LiteralPath $caddyExe) {
  & $caddyExe version
  Write-Host "Caddy 已存在：$caddyExe" -ForegroundColor Green
  exit 0
}

New-Item -ItemType Directory -Force -Path $caddyDir | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$api = Invoke-RestMethod -Uri "https://api.github.com/repos/caddyserver/caddy/releases/tags/$version" -Headers @{ 'User-Agent' = 'WFLA-Wall-Installer' } -TimeoutSec 30
$releaseAsset = $api.assets | Where-Object { $_.name -eq $asset } | Select-Object -First 1
if (-not $releaseAsset) { throw "Release API did not list $asset." }
$expectedDigest = [string]$releaseAsset.digest
if ($expectedDigest -notmatch '^sha256:([0-9a-fA-F]{64})$') { throw 'Release API did not provide a valid SHA-256 asset digest.' }
$expected = $Matches[1].ToLowerInvariant()
Invoke-WebRequest -Uri "$base/$asset" -OutFile $zip -UseBasicParsing
$actualBytes = (Get-Item -LiteralPath $zip).Length
if ($actualBytes -ne [long]$releaseAsset.size) { throw "Caddy download size mismatch: expected $($releaseAsset.size), got $actualBytes" }
$actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "Caddy SHA-256 mismatch: expected $expected, got $actual" }
Expand-Archive -LiteralPath $zip -DestinationPath $caddyDir -Force
if (-not (Test-Path -LiteralPath $caddyExe)) { throw 'caddy.exe was not found after extraction.' }
& $caddyExe version
if ($LASTEXITCODE -ne 0) { throw 'Caddy process failed to start.' }
Write-Host "Caddy 安装成功：$caddyExe" -ForegroundColor Green
