#requires -Version 5.1
<#
  世外墙 WFLA Wall - 第一次一键配置
  用法：在项目根目录执行
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\一键配置.ps1
  脚本从自身位置计算项目根目录，不依赖当前工作目录。
#>
[CmdletBinding()]
param(
  [switch]$ForceReconfigure
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

function Read-TextValue {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [string]$Default = '',
    [string]$Pattern = '',
    [string]$InvalidMessage = '输入格式不正确，请重新输入。'
  )
  while ($true) {
    $suffix = if ($Default -ne '') { " [$Default]" } else { '' }
    $value = Read-Host ($Prompt + $suffix)
    if ([string]::IsNullOrWhiteSpace($value)) { $value = $Default }
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      $value = $value.Trim()
      if ($Pattern -eq '' -or $value -match $Pattern) { return $value }
    }
    Write-Host $InvalidMessage -ForegroundColor Yellow
  }
}

function Read-YesNo {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [bool]$Default = $false
  )
  $suffix = if ($Default) { ' [Y/n]' } else { ' [y/N]' }
  while ($true) {
    $answer = Read-Host ($Prompt + $suffix)
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    if ($answer -match '^(y|yes|是|1)$') { return $true }
    if ($answer -match '^(n|no|否|0)$') { return $false }
    Write-Host '请输入 y 或 n。' -ForegroundColor Yellow
  }
}

function Convert-SecureToPlainText([Security.SecureString]$SecureValue) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Read-PasswordValue {
  param([Parameter(Mandatory = $true)][string]$Prompt)
  while ($true) {
    $secure = Read-Host $Prompt -AsSecureString
    $first = Convert-SecureToPlainText $secure
    if ($first.Length -lt 10 -or $first -notmatch '^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$') {
      Write-Host '密码至少 10 位，并且必须包含大写字母、小写字母、数字和符号。' -ForegroundColor Yellow
      continue
    }
    $secure2 = Read-Host '请再输入一次密码' -AsSecureString
    $second = Convert-SecureToPlainText $secure2
    if ($first -cne $second) {
      Write-Host '两次输入不一致，请重新输入。' -ForegroundColor Yellow
      continue
    }
    return $first
  }
}

function Read-OptionalSecret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  return Convert-SecureToPlainText $secure
}

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function Get-LanIpv4 {
  try {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.PrefixOrigin -ne 'WellKnown'
      } | Sort-Object InterfaceMetric
    $preferred = $candidates | Where-Object {
      $_.IPAddress -like '10.*' -or $_.IPAddress -like '192.168.*' -or $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[01])\.'
    } | Select-Object -First 1
    if ($preferred) { return $preferred.IPAddress }
    if ($candidates) { return ($candidates | Select-Object -First 1).IPAddress }
  } catch { }
  try {
    $addresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName())
    $candidate = $addresses | Where-Object {
      $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and -not [System.Net.IPAddress]::IsLoopback($_)
    } | Select-Object -First 1
    if ($candidate) { return $candidate.IPAddressToString }
  } catch { }
  return '127.0.0.1'
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

function Set-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )
  $lines = @()
  if (Test-Path -LiteralPath $script:EnvPath) { $lines = [IO.File]::ReadAllLines($script:EnvPath) }
  $found = $false
  $result = foreach ($line in $lines) {
    if ($line -match ('^\s*' + [regex]::Escape($Name) + '\s*=')) {
      $found = $true
      "$Name=$Value"
    } else { $line }
  }
  if (-not $found) { $result += "$Name=$Value" }
  [IO.File]::WriteAllLines($script:EnvPath, [string[]]$result, (New-Object Text.UTF8Encoding($false)))
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

function Test-BackendDependencies {
  if (-not (Test-Path -LiteralPath (Join-Path $script:Root 'node_modules\better-sqlite3'))) { return $false }
  & $script:Node -e "require(process.argv[1]); process.exit(0)" (Join-Path $script:Root 'node_modules\better-sqlite3') 2>$null
  return ($LASTEXITCODE -eq 0)
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
    if (-not (Test-Path -LiteralPath $dist)) { throw '前端构建完成但没有找到 frontend/dist。' }
    New-Item -ItemType Directory -Force -Path $public | Out-Null
    Get-ChildItem -LiteralPath $dist -Force | Copy-Item -Destination $public -Recurse -Force
  } else {
    Invoke-NativeStep '构建前端（自托管包）' { & $script:Npm --prefix $script:Root run selfhost:build }
  }
}

function Assert-Layout {
  $repoConfig = Join-Path $script:Root 'src\selfhost\config.ts'
  $packageConfig = Join-Path $script:Root 'src-backend\selfhost\config.ts'
  if (-not (Test-Path -LiteralPath $repoConfig) -and -not (Test-Path -LiteralPath $packageConfig)) {
    throw '没有找到后端源码，请确认脚本位于项目 scripts 目录。'
  }
  if (-not (Test-Path -LiteralPath (Join-Path $script:Root 'package.json'))) {
    throw '没有找到 package.json，请确认项目目录完整。'
  }
}

try {
  Assert-Layout
  if (-not $script:Npm -or -not $script:Node) { throw '没有找到 Node.js / npm，请先安装 Node.js 20 或更高版本。' }

  Write-Section '世外墙 WFLA Wall 第一次一键配置'
  Write-Host "项目目录：$script:Root"
  Write-Host '说明：脚本只会建立本机配置和运行数据，不会把密钥上传到网络。' -ForegroundColor DarkGray

  $reuseEnv = $false
  $secret = $null
  $existingOrigin = $null
  if (Test-Path -LiteralPath $script:EnvPath) {
    $existingOrigin = Get-DotEnvValue 'PUBLIC_ORIGIN'
    Write-Host ''
    Write-Host "检测到已有配置文件：$script:EnvPath" -ForegroundColor Yellow
    if (-not $ForceReconfigure -and -not (Read-YesNo '是否重新配置并覆盖 .env？' $false)) {
      $reuseEnv = $true
      $secret = Get-DotEnvValue 'AUTH_SESSION_SECRET'
      if ([string]::IsNullOrWhiteSpace($secret)) { $secret = New-RandomSecret; Set-DotEnvValue 'AUTH_SESSION_SECRET' $secret }
      Write-Host '将保留现有 .env，仅继续执行迁移、构建和管理员检查。' -ForegroundColor Cyan
    }
  }

  if (-not $reuseEnv) {
    Write-Section '1/6 访问方式'
    $mode = Read-TextValue '监听方式：1=仅本机，2=局域网，3=反向代理/内网穿透' '2' '^[123]$' '请输入 1、2 或 3。'
    $port = [int](Read-TextValue '服务端口' '8787' '^\d{1,5}$' '端口必须是 1-65535 的数字。')
    if ($port -lt 1 -or $port -gt 65535) { throw '端口必须在 1-65535 之间。' }

    if ($mode -eq '1') { $hostAddress = '127.0.0.1'; $defaultOrigin = "http://127.0.0.1:$port" }
    elseif ($mode -eq '2') { $hostAddress = '0.0.0.0'; $defaultOrigin = "http://$(Get-LanIpv4):$port" }
    else { $hostAddress = '127.0.0.1'; $defaultOrigin = 'https://forum.example.com' }

    $origin = Read-TextValue '对外访问地址（浏览器地址栏会使用的完整地址）' $defaultOrigin '^https?://[^\s/]+(:\d+)?$' '必须是完整地址，例如 http://192.168.1.10:8787 或 https://forum.example.com'
    $origin = $origin.TrimEnd('/')
    $trustProxy = $false
    if ($mode -eq '3') { $trustProxy = Read-YesNo '前面是否有你信任的反向代理/内网穿透？' $true }

    Write-Section '2/6 站点与 Cookie'
    $forumName = Read-TextValue '论坛名称' '世外墙 WFLA Wall'
    if ($forumName.Length -gt 80) { throw '论坛名称不能超过 80 个字符。' }
    $cookieSecure = $origin.StartsWith('https://', [StringComparison]::OrdinalIgnoreCase)
    Write-Host "安全 Cookie：$cookieSecure（跟随 https/http 自动决定）" -ForegroundColor DarkGray

    Write-Section '3/6 初始化板块'
    $createBoards = Read-YesNo '是否创建默认板块（综合讨论、学业交流、社团活动、技术与创作）？' $true

    Write-Section '4/6 管理员账号'
    $adminUsername = Read-TextValue '管理员用户名（3-32 位字母、数字、下划线）' '' '^[A-Za-z0-9_]{3,32}$' '用户名格式不正确。'
    $adminPassword = Read-PasswordValue '管理员密码'
    $adminRealName = Read-TextValue '真实中文姓名（会公开展示）' '' '^[\u4E00-\u9FA5]{2,10}$' '请输入 2-10 个中文汉字。'
    $adminYear = Read-TextValue '届别（毕业年份，例如 2029）' '' '^20\d{2}$' '届别应为 2000-2099 的四位年份。'

    Write-Section '5/6 Microsoft 登录（可选）'
    $configureMicrosoft = Read-YesNo '是否现在就填写 Microsoft OAuth 配置？教师/学生可用第三方方式登录需要它。' $false
    $msClientId = ''
    $msClientSecret = ''
    $msRedirectUri = ''
    if ($configureMicrosoft) {
      $msClientId = Read-TextValue 'Microsoft Application (client) ID' ''
      $msClientSecret = Read-OptionalSecret 'Microsoft Client Secret（输入不会回显）'
      $msRedirectUriDefault = "$origin/api/v1/auth/microsoft/callback"
      $msRedirectUri = Read-TextValue 'Microsoft 回调地址' $msRedirectUriDefault '^https?://[^\s]+$' '回调地址格式不正确。'
    }

    Write-Section '6/6 写入配置'
    $secret = New-RandomSecret
    $envLines = @(
      '# 由 scripts\一键配置.ps1 生成，请勿提交到 Git。'
      "PUBLIC_ORIGIN=$origin"
      "HOST=$hostAddress"
      "PORT=$port"
      ''
      'WFLA_DB_PATH=data/wfla-wall.sqlite'
      'WFLA_FRONTEND_DIR=public'
      'WFLA_BACKUP_DIR=backups'
      ''
      'ENVIRONMENT=production'
      "FORUM_NAME=$forumName"
      'SESSION_TTL_SECONDS=604800'
      "AUTH_SESSION_SECRET=$secret"
      ''
      "COOKIE_SECURE=$($cookieSecure.ToString().ToLowerInvariant())"
      'COOKIE_SAMESITE=Lax'
      "TRUST_PROXY_HEADERS=$($trustProxy.ToString().ToLowerInvariant())"
      "WFLA_CREATE_DEFAULT_BOARDS=$(if ($createBoards) { '1' } else { '0' })"
      ''
      '# Microsoft OAuth（留空表示暂不启用）'
      "MS_CLIENT_ID=$msClientId"
      "MS_CLIENT_SECRET=$msClientSecret"
      "MS_REDIRECT_URI=$msRedirectUri"
      ''
    )
    [IO.File]::WriteAllLines($script:EnvPath, [string[]]$envLines, (New-Object Text.UTF8Encoding($false)))
    Write-Host "配置已写入：$script:EnvPath" -ForegroundColor Green
  }

  Write-Section '安装与初始化'
  if (-not (Test-BackendDependencies)) {
    Invoke-NativeStep '安装后端依赖（可能较慢）' { & $script:Npm --prefix $script:Root ci --ignore-scripts }
    if (-not (Test-BackendDependencies)) {
      Invoke-NativeStep '尝试重建 better-sqlite3' { & $script:Npm --prefix $script:Root rebuild better-sqlite3 }
    }
  } else {
    Write-Host '[跳过] better-sqlite3 已可用。' -ForegroundColor DarkGray
  }

  Invoke-NativeStep '应用数据库迁移' { & $script:Npm --prefix $script:Root run selfhost:migrate }
  Build-Frontend

  if ($reuseEnv) {
    & $script:Npm --prefix $script:Root run selfhost:create-owner -- --check *> $null
    if ($LASTEXITCODE -eq 0) {
      $adminUsername = $null
      Write-Host '[跳过] 数据库中已经存在所有者账号，不会重复创建。' -ForegroundColor DarkGray
    } else {
      $adminUsername = Read-TextValue '管理员用户名' ''
      $adminPassword = Read-PasswordValue '管理员密码'
      $adminRealName = Read-TextValue '真实中文姓名（会公开展示）' '' '^[\u4E00-\u9FA5]{2,10}$' '请输入 2-10 个中文汉字。'
      $adminYear = Read-TextValue '届别（毕业年份）' '' '^20\d{2}$' '届别应为 2000-2099 的四位年份。'
    }
  }

  if ($adminUsername) {
    Write-Host '[执行] 创建管理员账号' -ForegroundColor Green
    $env:WFLA_OWNER_PASSWORD = $adminPassword
    $env:WFLA_OWNER_EXISTS = 'skip'
    try {
      & $script:Npm --prefix $script:Root run selfhost:create-owner -- $adminUsername $adminRealName $adminYear
      if ($LASTEXITCODE -ne 0) { throw "管理员初始化失败，退出码：$LASTEXITCODE" }
    } finally {
      Remove-Item Env:WFLA_OWNER_PASSWORD -ErrorAction SilentlyContinue
      Remove-Item Env:WFLA_OWNER_EXISTS -ErrorAction SilentlyContinue
    }
  } else {
    Write-Host '[跳过] 所有者账号已存在。' -ForegroundColor DarkGray
  }

  $finalOrigin = if ($reuseEnv) { Get-DotEnvValue 'PUBLIC_ORIGIN' } else { $origin }
  Write-Section '配置完成'
  Write-Host "论坛地址：$finalOrigin" -ForegroundColor Green
  Write-Host '以后启动服务请运行：' -ForegroundColor Cyan
  Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\一键启动.ps1`"" -ForegroundColor White
  Write-Host '也可以直接双击 scripts\一键启动.cmd。' -ForegroundColor DarkGray
} catch {
  Write-Host ''
  Write-Host "配置失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}