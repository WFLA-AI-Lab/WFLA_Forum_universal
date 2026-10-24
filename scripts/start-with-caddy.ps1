#requires -Version 5.1
<#
  启动论坛和 Caddy 本地 HTTPS 源站。
  论坛监听 .env 中的端口（默认 8888），Caddy 默认监听 127.0.0.1:8443。
#>
[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath.TrimEnd('\', '/')
$caddyExe = Join-Path $root 'tools\caddy\caddy.exe'
$caddyfile = Join-Path $root 'Caddyfile'
$envPath = Join-Path $root '.env'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$tsxCli = Join-Path $root 'node_modules\tsx\dist\cli.mjs'
$serverEntry = if (Test-Path -LiteralPath (Join-Path $root 'src-backend\selfhost\server.ts')) {
  Join-Path $root 'src-backend\selfhost\server.ts'
} else {
  Join-Path $root 'src\selfhost\server.ts'
}

if (-not (Test-Path -LiteralPath $caddyExe)) { throw '未找到 Caddy，请先运行 scripts\install-caddy.ps1。' }
if (-not (Test-Path -LiteralPath $caddyfile)) { throw '未找到 Caddyfile，请先运行 scripts\configure-caddy.ps1。' }
if (-not (Test-Path -LiteralPath $envPath)) { throw '未找到 .env，请先运行一键配置。' }
if (-not (Test-Path -LiteralPath $tsxCli)) { throw '缺少 tsx，请先重新运行一键配置。' }
if (-not (Test-Path -LiteralPath $serverEntry)) { throw '找不到后端入口 server.ts。' }
& $caddyExe validate --config $caddyfile --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Caddyfile 校验失败。' }
if ($CheckOnly) { Write-Host 'Caddy HTTPS 启动检查通过。' -ForegroundColor Green; exit 0 }

Write-Host '[1/2] 启动论坛（Node）' -ForegroundColor Green
$nodeProcess = Start-Process -FilePath $node -ArgumentList @($tsxCli, $serverEntry) -WorkingDirectory $root -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Seconds 3
  if ($nodeProcess.HasExited) { throw "论坛进程启动失败，退出码：$($nodeProcess.ExitCode)" }
  Write-Host '[2/2] 启动 Caddy（HTTPS 源站）' -ForegroundColor Green
  Write-Host '浏览器/隧道地址：https://127.0.0.1:8443' -ForegroundColor Cyan
  Write-Host '停止：在本窗口按 Ctrl+C。' -ForegroundColor DarkGray
  & $caddyExe run --config $caddyfile --adapter caddyfile
} finally {
  if ($nodeProcess -and -not $nodeProcess.HasExited) {
    Stop-Process -Id $nodeProcess.Id -Force -ErrorAction SilentlyContinue
  }
}