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
$script:Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
$script:EnvPath = Join-Path $script:Root '.env'
$script:Npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $script:Npm) { $script:Npm = (Get-Command npm -ErrorAction SilentlyContinue).Source }
$script:Node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $script:Node) { $script:Node = (Get-Command node -ErrorAction SilentlyContinue).Source }

# 第三方登录（GitHub / Microsoft）要求 Node 信任 Windows 根证书。
# 缺少这一项时，被代理或内网穿透接管的 HTTPS 连接会报
# "unable to verify the first certificate"，登录回调将失败。
$env:NODE_USE_SYSTEM_CA = '1'

function Initialize-TrustedRoots {
  if ($env:NODE_EXTRA_CA_CERTS) { return }
  $caDir = Join-Path $script:Root 'data'
  $caPath = Join-Path $caDir 'windows-root-cas.pem'
  try {
    if (-not (Test-Path -LiteralPath $caDir)) { New-Item -ItemType Directory -Force -Path $caDir | Out-Null }
    $rebuild = $true
    if (Test-Path -LiteralPath $caPath) {
      # Rebuild weekly so rotated or newly installed roots are picked up.
      $rebuild = ((Get-Date) - (Get-Item -LiteralPath $caPath).LastWriteTime).TotalDays -gt 7
    }
    if ($rebuild) {
      $builder = [Text.StringBuilder]::new()
      $count = 0
      foreach ($store in @('Cert:\LocalMachine\Root', 'Cert:\CurrentUser\Root')) {
        foreach ($cert in Get-ChildItem $store -ErrorAction SilentlyContinue) {
          if ($cert.RawData.Length -le 0) { continue }
          [void]$builder.AppendLine('-----BEGIN CERTIFICATE-----')
          [void]$builder.AppendLine([Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks'))
          [void]$builder.AppendLine('-----END CERTIFICATE-----')
          $count++
        }
      }
      if ($count -gt 0) {
        [IO.File]::WriteAllText($caPath, $builder.ToString(), [Text.UTF8Encoding]::new($false))
        Write-Host "[准备] 已导出 $count 个系统根证书供 Node 信任。" -ForegroundColor DarkGray
      }
    }
    if (Test-Path -LiteralPath $caPath) { $env:NODE_EXTRA_CA_CERTS = $caPath }
  } catch {
    Write-Host "[提示] 无法导出系统根证书（$($_.Exception.Message)）。" -ForegroundColor Yellow
    Write-Host '       将仅依赖 NODE_USE_SYSTEM_CA；若第三方登录仍失败请查看诊断面板。' -ForegroundColor DarkGray
  }
}

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

function Stop-StaleSelfHostProcesses {
  # Older packages launched src-backend/selfhost/server.ts. Those orphaned
  # processes can hold the same SQLite file/WAL lock and the configured port,
  # which surfaces as an opaque "SqliteError: disk I/O error" on startup.
  foreach ($process in Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue) {
    $commandLine = [string]$process.CommandLine
    if ($commandLine -like '*wfla-wall-selfhost-package*' -and $commandLine -like '*src-backend*selfhost*server.ts*') {
      Write-Host "[清理] 停止旧的 src-backend 服务进程 PID $($process.ProcessId)。" -ForegroundColor Yellow
      Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Assert-SelfHostPortAvailable {
  param([Parameter(Mandatory = $true)][int]$Port)
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $listeners) { return }
  foreach ($listener in $listeners) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    $commandLine = if ($owner) { [string]$owner.CommandLine } else { '' }
    if ($commandLine -like '*wfla-wall-selfhost-package*' -and $commandLine -like '*src\selfhost\server.ts*') {
      throw "端口 $Port 已被本项目的另一个新服务占用（PID $($listener.OwningProcess)）。请先关闭那个窗口，或修改 .env 中的 PORT。"
    }
    throw "端口 $Port 已被其它程序占用（PID $($listener.OwningProcess)）。请关闭占用程序，或修改 .env 中的 PORT。"
  }
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
    # A complete sync prevents stale chunks (especially lazy skin bundles) from
    # surviving in public/ while a fresh index.html references new filenames.
    Get-ChildItem -LiteralPath $public -Force | Remove-Item -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $dist '*') -Destination $public -Recurse -Force
  } else {
    Invoke-NativeStep '构建前端（自托管包）' { & $script:Npm --prefix $script:Root run selfhost:build }
  }
}

try {
  Initialize-TrustedRoots
  if (-not $script:Npm -or -not $script:Node) { throw '没有找到 Node.js / npm，请先安装 Node.js 22.12 或更高版本。' }
  $nodeVersionText = (& $script:Node -p "process.versions.node" 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeVersionText)) { throw '无法读取 Node.js 版本，请重新安装 Node.js 22.12 或更高版本。' }
  $nodeVersionParts = $nodeVersionText.Trim().Split('.')
  if ($nodeVersionParts.Count -lt 3) { throw "无法识别 Node.js 版本：$nodeVersionText" }
  $nodeVersion = [version]("{0}.{1}.{2}" -f $nodeVersionParts[0], $nodeVersionParts[1], $nodeVersionParts[2])
  if ($nodeVersion -lt [version]'22.12.0') { throw "当前 Node.js 版本为 $nodeVersionText，项目至少需要 22.12.0。请升级 Node.js 后重试。" }
  if (-not (Test-Path -LiteralPath (Join-Path $script:Root 'package.json'))) { throw '没有找到 package.json。' }
  if (-not (Test-Path -LiteralPath $script:EnvPath)) { throw '没有找到 .env。请先运行 scripts\一键配置.ps1 完成第一次配置。' }
  if ([string]::IsNullOrWhiteSpace((Get-DotEnvValue 'PUBLIC_ORIGIN'))) { throw '.env 中缺少 PUBLIC_ORIGIN。' }
  if ([string]::IsNullOrWhiteSpace((Get-DotEnvValue 'AUTH_SESSION_SECRET'))) { throw '.env 中缺少 AUTH_SESSION_SECRET。' }

  $dbRelative = Get-DotEnvValue 'WFLA_DB_PATH'
  if ([string]::IsNullOrWhiteSpace($dbRelative)) { $dbRelative = 'data/wfla-wall.sqlite' }
  $dbPath = if ([IO.Path]::IsPathRooted($dbRelative)) { $dbRelative } else { Join-Path $script:Root $dbRelative }
  if (-not (Test-Path -LiteralPath $dbPath)) { throw "数据库不存在：$dbPath。请先成功运行 scripts\一键配置.ps1。" }
  if (-not (Test-Path -LiteralPath (Join-Path $script:Root 'node_modules'))) { throw '缺少 node_modules。请先重新运行 scripts\一键配置.ps1。' }

  Stop-StaleSelfHostProcesses
  $port = [int](Get-DotEnvValue 'PORT')
  if ($port -le 0) { $port = 8888 }
  Assert-SelfHostPortAvailable -Port $port

  $publicIndex = Join-Path $script:Root 'public\index.html'
  # The checked-in frontend source may have changed after git pull while
  # public/ still contains an older Vite build. Rebuild by default so the
  # server never serves stale UI code; -NoBuild remains available when the
  # operator intentionally wants to reuse an existing artifact.
  if (-not $NoBuild) {
    Write-Host '正在同步最新前端构建……' -ForegroundColor Yellow
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

  if ($CheckOnly) {
    Write-Host '[执行] 第三方登录出站连通性自检' -ForegroundColor Green
    $probeFile = Join-Path $script:Root 'scripts\outbound-probe.mjs'
    if (-not (Test-Path -LiteralPath $probeFile)) { throw "缺少连通性自检脚本：$probeFile" }
    & $script:Node $probeFile
    if ($LASTEXITCODE -ne 0) { throw '第三方登录出站连通性自检失败。' }
    Write-Host '自检通过。' -ForegroundColor Green
    exit 0
  }

  # UNC shares cannot be used as a CMD working directory; bypass npm.cmd and start tsx directly.
  $tsxCli = Join-Path $script:Root 'node_modules\tsx\dist\cli.mjs'
  $serverEntry = Join-Path $script:Root 'src\selfhost\server.ts'
  if (-not (Test-Path -LiteralPath $tsxCli)) { throw "缺少 tsx：$tsxCli。请重新运行一键配置。" }
  if (-not (Test-Path -LiteralPath $serverEntry)) { throw "找不到后端入口 server.ts。" }
  Set-Location -LiteralPath $script:Root
  & $script:Node $tsxCli $serverEntry
  if ($LASTEXITCODE -ne 0) { throw "服务退出，退出码：$LASTEXITCODE" }
} catch {
  Write-Host ''
  Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host '若问题与依赖有关，请重新运行 scripts\一键配置.ps1。' -ForegroundColor DarkGray
  exit 1
}
