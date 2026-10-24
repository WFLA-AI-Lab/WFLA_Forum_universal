#requires -Version 5.1
<#
  世外墙 WFLA Wall - 日常一键启动
  用法：直接运行本脚本，或在项目根目录执行
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\一键启动.ps1
  脚本从自身位置计算项目根目录，不依赖当前工作目录。
#>
[CmdletBinding()]
param(
  [switch]$NoBuild,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$script:Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:EnvPath = Join-Path $script:Root '.env'
$script:Npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $script:Npm) { $script:Npm = (Get-Command npm -ErrorAction SilentlyContinue).Source }
$script:Node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $script:Node) { $script:Node = (Get-Command node -ErrorAction SilentlyContinue).Source }

function Write-Section([string]$Text) {
  Write-Host ''
  Write-Host ('=' * 64) -ForegroundColor DarkCyan
  Write-Host $Text -ForegroundColor Cyan
  Write-Host ('=' * 64) -ForegroundColor DarkCyan
}

function Get-DotEnvValue {
  param([Parameter(Mandatory = $true)][string]$Name)
  if (-not (Test-Path -LiteralPath $script:EnvPath)) { return $null }
  foreach ($line in [IO.File]::ReadAllLines($script:EnvPath)) {
    if ($line -match ('^\s*' + [regex]::Escape($Name) + '\s*=\s*(.*)$')) {
      return $Matches[1].Trim().Trim("'").Trim('"')
    }
  }
  return $null
}

function Invoke-NativeStep {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )
  Write-Host "[执行] $Label" -ForegroundColor Green
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Label 失败，退出码：$LASTEXITCODE" }
}

function Build-Frontend {
  $frontendPackage = Join-Path $script:Root 'frontend\package.json'
  if (Test-Path -LiteralPath $frontendPackage) {
    if (-not (Test-Path -LiteralPath (Join-Path $script:Root 'frontend\node_modules'))) {
      Invoke-NativeStep '安装前端依赖（frontend）' { & $script:Npm --prefix (Join-Path $script:Root 'frontend') ci --ignore-scripts }
    }
    Invoke-NativeStep '构建前端（仓库版）' { & $script:Npm --prefix (Join-Path $script:Root 'frontend') run build }
    $dist = Join-Path $script:Root 'frontend\dist'
    $public = Join-Path $script:Root 'public'
    if (-not (Test-Path -LiteralPath $dist)) { throw '找不到 frontend/dist，前端构建异常。' }
    New-Item -ItemType Directory -Force -Path $public | Out-Null
    Get-ChildItem -LiteralPath $dist -Force | Copy-Item -Destination $public -Recurse -Force
  } else {
    Invoke-NativeStep '构建前端（自托管包）' { & $script:Npm --prefix $script:Root run selfhost:build }
  }
}

try {
  if (-not $script:Npm -or -not $script:Node) { throw '没有找到 Node.js / npm，请先安装 Node.js 20 或更高版本。' }
  if (-not (Test-Path -LiteralPath (Join-Path $script:Root 'package.json'))) { throw '没有找到 package.json。' }
  if (-not (Test-Path -LiteralPath $script:EnvPath)) { throw '没有找到 .env。请先运行 scripts\一键配置.ps1 完成第一次配置。' }
  if ([string]::IsNullOrWhiteSpace((Get-DotEnvValue 'PUBLIC_ORIGIN'))) { throw '.env 中缺少 PUBLIC_ORIGIN。' }
  if ([string]::IsNullOrWhiteSpace((Get-DotEnvValue 'AUTH_SESSION_SECRET'))) { throw '.env 中缺少 AUTH_SESSION_SECRET。' }

  $dbRelative = Get-DotEnvValue 'WFLA_DB_PATH'
  if ([string]::IsNullOrWhiteSpace($dbRelative)) { $dbRelative = 'data/wfla-wall.sqlite' }
  $dbPath = if ([IO.Path]::IsPathRooted($dbRelative)) { $dbRelative } else { Join-Path $script:Root $dbRelative }
  if (-not (Test-Path -LiteralPath $dbPath)) { throw "数据库不存在：$dbPath。请先成功运行 scripts\一键配置.ps1。" }
  if (-not (Test-Path -LiteralPath (Join-Path $script:Root 'node_modules'))) { throw '缺少 node_modules。请先重新运行 scripts\一键配置.ps1。' }

  $publicIndex = Join-Path $script:Root 'public\index.html'
  if (-not $NoBuild -and -not (Test-Path -LiteralPath $publicIndex)) {
    Write-Host '没有找到构建后的前端，正在自动构建……' -ForegroundColor Yellow
    Build-Frontend
  }
  if (-not (Test-Path -LiteralPath $publicIndex)) { throw '前端仍未构建，请检查 frontend/dist 或 public/index.html。' }

  $origin = Get-DotEnvValue 'PUBLIC_ORIGIN'
  Write-Section '世外墙 WFLA Wall'
  Write-Host "项目目录：$script:Root"
  Write-Host "访问地址：$origin" -ForegroundColor Green
  Write-Host "数据库：$dbPath"
  Write-Host '停止服务：在本窗口按 Ctrl+C。' -ForegroundColor DarkGray
  Write-Host ''

  if ($CheckOnly) { Write-Host '自检通过。' -ForegroundColor Green; exit 0 }

  Set-Location -LiteralPath $script:Root
  & $script:Npm --prefix $script:Root run selfhost:start
  if ($LASTEXITCODE -ne 0) { throw "服务退出，退出码：$LASTEXITCODE" }
} catch {
  Write-Host ''
  Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host '若问题与依赖有关，请重新运行 scripts\一键配置.ps1。' -ForegroundColor DarkGray
  exit 1
}