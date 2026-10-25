#requires -Version 5.1
<#
  世外墙 WFLA Wall - 第一次一键配置
  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\一键配置.ps1
  任意输入步骤都可以输入 b 返回上一步。脚本使用相对路径，不依赖当前终端目录。
#>
[CmdletBinding()]
param(
  [switch]$ForceReconfigure
)

$ErrorActionPreference = 'Stop'
$script:Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
$script:EnvPath = Join-Path $script:Root '.env'
$script:BACK = '__WFLA_BACK__'
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

function Write-BackHint {
  Write-Host '提示：输入 b 可以返回上一步。' -ForegroundColor DarkGray
}

function Read-TextValue {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [string]$Default = '',
    [string]$Pattern = '',
    [string]$InvalidMessage = '输入格式不正确，请重新输入。',
    [switch]$AllowBack
  )
  while ($true) {
    $suffix = if ($Default -ne '') { " [$Default]" } else { '' }
    $value = Read-Host ($Prompt + $suffix)
    if ($AllowBack -and $value.Trim() -ieq 'b') { return $script:BACK }
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
    [bool]$Default = $false,
    [switch]$AllowBack
  )
  $suffix = if ($Default) { ' [Y/n]' } else { ' [y/N]' }
  while ($true) {
    $answer = Read-Host ($Prompt + $suffix)
    if ($AllowBack -and $answer.Trim() -ieq 'b') { return $script:BACK }
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

function Test-PasswordStrength([string]$Value) {
  return $Value.Length -ge 10 -and $Value -match '^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$'
}

function Read-PasswordValue {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [string]$Existing = '',
    [switch]$AllowBack
  )
  if ($Existing -ne '') {
    Write-Host '已设置过管理员密码。' -ForegroundColor DarkGray
    $change = Read-YesNo '是否重新设置管理员密码？' $false -AllowBack:$AllowBack
    if ($script:BACK -eq $change) { return $script:BACK }
    if (-not $change) { return $Existing }
  }
  while ($true) {
    $secure = Read-Host $Prompt -AsSecureString
    $first = Convert-SecureToPlainText $secure
    if ($AllowBack -and $first.Trim() -ieq 'b') { return $script:BACK }
    if (-not (Test-PasswordStrength $first)) {
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
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
      Sort-Object InterfaceMetric
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

function Step-Access {
  Write-Section '1/6 访问方式'
  Write-BackHint
  $mode = Read-TextValue '监听方式：1=仅本机，2=局域网，3=反向代理/内网穿透' $script:WizAccessMode '^[123]$' '请输入 1、2 或 3。' -AllowBack
  if ($script:BACK -eq $mode) { return 'back' }
  $portValue = Read-TextValue '服务端口' $script:WizPort '^\d{1,5}$' '端口必须是 1-65535 的数字。' -AllowBack
  if ($script:BACK -eq $portValue) { return 'back' }
  $portNumber = [int]$portValue
  if ($portNumber -lt 1 -or $portNumber -gt 65535) { throw '端口必须在 1-65535 之间。' }

  if ($mode -eq '1') { $hostAddress = '127.0.0.1'; $defaultOrigin = "http://127.0.0.1:$portNumber" }
  elseif ($mode -eq '2') { $hostAddress = '0.0.0.0'; $defaultOrigin = "http://$(Get-LanIpv4):$portNumber" }
  else { $hostAddress = '127.0.0.1'; $defaultOrigin = $script:WizOrigin }

  $origin = Read-TextValue '对外访问地址（浏览器实际打开的完整地址）' $defaultOrigin '^https?://[^\s/]+(:\d+)?$' '必须是完整地址，例如 http://wflawall.zh.kg:49257 或 https://wflawall.zh.kg' -AllowBack
  if ($script:BACK -eq $origin) { return 'back' }
  $origin = $origin.TrimEnd('/')

  $trustProxy = $script:WizTrustProxy
  if ($mode -eq '3') {
    $trustProxy = Read-YesNo '前面是否有你信任的反向代理/内网穿透（可以转发真实 IP 和 HTTPS 协议）？' $script:WizTrustProxy -AllowBack
    if ($script:BACK -eq $trustProxy) { return 'back' }
  }

  $script:WizAccessMode = $mode
  $script:WizPort = $portNumber
  $script:WizHostAddress = $hostAddress
  $script:WizOrigin = $origin
  $script:WizTrustProxy = [bool]$trustProxy
  return 'next'
}

function Step-Site {
  Write-Section '2/6 站点与 Cookie'
  Write-BackHint
  $forumName = Read-TextValue '论坛名称' $script:WizForumName '' '' -AllowBack
  if ($script:BACK -eq $forumName) { return 'back' }
  if ($forumName.Length -gt 80) { throw '论坛名称不能超过 80 个字符。' }
  $script:WizForumName = $forumName
  $script:WizCookieSecure = $script:WizOrigin.StartsWith('https://', [StringComparison]::OrdinalIgnoreCase)
  Write-Host "安全 Cookie：$($script:WizCookieSecure)（跟随 http/https 自动决定）" -ForegroundColor DarkGray
  return 'next'
}

function Step-Boards {
  Write-Section '3/6 初始化板块'
  Write-BackHint
  $createBoards = Read-YesNo '是否创建默认板块（综合讨论、学业交流、社团活动、技术与创作）？' $script:WizCreateBoards -AllowBack
  if ($script:BACK -eq $createBoards) { return 'back' }
  $script:WizCreateBoards = [bool]$createBoards
  return 'next'
}

function Step-Admin {
  Write-Section '4/6 管理员账号'
  Write-BackHint
  $adminUsername = Read-TextValue '管理员用户名（3-32 位字母、数字、下划线）' $script:WizAdminUser '^[A-Za-z0-9_]{3,32}$' '用户名格式不正确。' -AllowBack
  if ($script:BACK -eq $adminUsername) { return 'back' }
  $adminPassword = Read-PasswordValue '管理员密码' $script:WizAdminPass -AllowBack
  if ($script:BACK -eq $adminPassword) { return 'back' }
  $adminRealName = Read-TextValue '真实中文姓名（会公开展示）' $script:WizAdminName '^[\u4E00-\u9FA5]{2,10}$' '请输入 2-10 个中文汉字。' -AllowBack
  if ($script:BACK -eq $adminRealName) { return 'back' }
  $adminYear = Read-TextValue '入学届别（入学年份，例如 2026）' $script:WizAdminYear '^20\d{2}$' '届别应为 2000-2099 的四位年份。' -AllowBack
  if ($script:BACK -eq $adminYear) { return 'back' }

  $script:WizAdminUser = $adminUsername
  $script:WizAdminPass = $adminPassword
  $script:WizAdminName = $adminRealName
  $script:WizAdminYear = $adminYear
  return 'next'
}

function Read-MicrosoftConfig {
  $msClientId = Read-TextValue 'Microsoft Application (client) ID' $script:WizMsClientId '' '' -AllowBack
  if ($script:BACK -eq $msClientId) { return $script:BACK }
  $msClientSecret = Read-OptionalSecret 'Microsoft Client Secret（输入不会回显）'
  if ($msClientSecret.Trim() -ieq 'b') { return $script:BACK }
  $msRedirectDefault = if ($script:WizMsRedirectUri) { $script:WizMsRedirectUri } else { "$($script:WizOrigin)/api/v1/auth/microsoft/callback" }
  $msRedirectUri = Read-TextValue 'Microsoft 回调地址' $msRedirectDefault '^https?://[^\s]+$' '回调地址格式不正确。' -AllowBack
  if ($script:BACK -eq $msRedirectUri) { return $script:BACK }
  $script:WizMsClientId = $msClientId
  $script:WizMsClientSecret = $msClientSecret
  $script:WizMsRedirectUri = $msRedirectUri
  return 'ok'
}

function Read-GitHubConfig {
  $ghClientId = Read-TextValue 'GitHub OAuth App Client ID' $script:WizGhClientId '' '' -AllowBack
  if ($script:BACK -eq $ghClientId) { return $script:BACK }
  $ghClientSecret = Read-OptionalSecret 'GitHub OAuth App Client Secret（输入不会回显）'
  if ($ghClientSecret.Trim() -ieq 'b') { return $script:BACK }
  $ghRedirectDefault = if ($script:WizGhRedirectUri) { $script:WizGhRedirectUri } else { "$($script:WizOrigin)/api/v1/auth/github/callback" }
  $ghRedirectUri = Read-TextValue 'GitHub 回调地址' $ghRedirectDefault '^https?://[^\s]+$' '回调地址格式不正确。' -AllowBack
  if ($script:BACK -eq $ghRedirectUri) { return $script:BACK }
  $script:WizGhClientId = $ghClientId
  $script:WizGhClientSecret = $ghClientSecret
  $script:WizGhRedirectUri = $ghRedirectUri
  return 'ok'
}

function Step-Login {
  Write-Section '5/6 第三方登录'
  Write-BackHint
  while ($true) {
    Write-Host '请选择第三方登录方式：' -ForegroundColor White
    Write-Host '  1 = 不启用第三方登录（只用论坛账号密码）'
    Write-Host '  2 = Microsoft 登录'
    Write-Host '  3 = GitHub 登录'
    Write-Host '  4 = Microsoft + GitHub'
    Write-Host '  b = 返回上一步'
    $choice = Read-TextValue '选择' $script:WizLoginChoice '^[1234]$' '请输入 1、2、3 或 4。' -AllowBack
    if ($script:BACK -eq $choice) { return 'back' }

    $wantMicrosoft = $choice -in @('2', '4')
    $wantGitHub = $choice -in @('3', '4')

    if ($wantMicrosoft) {
      $result = Read-MicrosoftConfig
      if ($script:BACK -eq $result) { continue }
    } else {
      $script:WizMsClientId = ''
      $script:WizMsClientSecret = ''
      $script:WizMsRedirectUri = ''
    }

    if ($wantGitHub) {
      $result = Read-GitHubConfig
      if ($script:BACK -eq $result) { continue }
    } else {
      $script:WizGhClientId = ''
      $script:WizGhClientSecret = ''
      $script:WizGhRedirectUri = ''
    }

    $script:WizLoginChoice = $choice
    return 'next'
  }
}

function Step-Write {
  Write-Section '6/6 确认并写入'
  Write-Host "访问方式：$($script:WizAccessMode)"
  Write-Host "监听地址：$($script:WizHostAddress):$($script:WizPort)"
  Write-Host "对外地址：$($script:WizOrigin)"
  Write-Host "论坛名称：$($script:WizForumName)"
  Write-Host "默认板块：$($script:WizCreateBoards)"
  Write-Host "管理员：$($script:WizAdminUser) / $($script:WizAdminName) / $($script:WizAdminYear) 届"
  $loginLabel = switch ($script:WizLoginChoice) {
    '1' { '不启用' }
    '2' { 'Microsoft' }
    '3' { 'GitHub' }
    '4' { 'Microsoft + GitHub' }
  }
  Write-Host "第三方登录：$loginLabel"
  $confirm = Read-YesNo '确认写入配置并继续初始化？' $true -AllowBack
  if ($script:BACK -eq $confirm) { return 'back' }
  if (-not $confirm) { return 'back' }

  $secret = New-RandomSecret
  $envLines = @(
    '# 由 scripts\一键配置.ps1 生成，请勿提交到 Git。'
    "PUBLIC_ORIGIN=$($script:WizOrigin)"
    "HOST=$($script:WizHostAddress)"
    "PORT=$($script:WizPort)"
    ''
    'WFLA_DB_PATH=data/wfla-wall.sqlite'
    'WFLA_FRONTEND_DIR=public'
    'WFLA_BACKUP_DIR=backups'
    ''
    'ENVIRONMENT=production'
    "FORUM_NAME=$($script:WizForumName)"
    'SESSION_TTL_SECONDS=604800'
    "AUTH_SESSION_SECRET=$secret"
    ''
    "COOKIE_SECURE=$($script:WizCookieSecure.ToString().ToLowerInvariant())"
    'COOKIE_SAMESITE=Lax'
    "TRUST_PROXY_HEADERS=$($script:WizTrustProxy.ToString().ToLowerInvariant())"
    "WFLA_CREATE_DEFAULT_BOARDS=$(if ($script:WizCreateBoards) { '1' } else { '0' })"
    ''
    '# Microsoft OAuth（留空表示不启用）'
    "MS_CLIENT_ID=$($script:WizMsClientId)"
    "MS_CLIENT_SECRET=$($script:WizMsClientSecret)"
    "MS_REDIRECT_URI=$($script:WizMsRedirectUri)"
    ''
    '# GitHub OAuth（留空表示不启用）'
    "GITHUB_CLIENT_ID=$($script:WizGhClientId)"
    "GITHUB_CLIENT_SECRET=$($script:WizGhClientSecret)"
    "GITHUB_REDIRECT_URI=$($script:WizGhRedirectUri)"
    ''
  )
  [IO.File]::WriteAllLines($script:EnvPath, [string[]]$envLines, (New-Object Text.UTF8Encoding($false)))
  Write-Host "配置已写入：$($script:EnvPath)" -ForegroundColor Green
  return 'next'
}

try {
  Assert-Layout
  if (-not $script:Npm -or -not $script:Node) { throw '没有找到 Node.js / npm，请先安装 Node.js 22.12 或更高版本。' }
  $nodeVersionText = (& $script:Node -p "process.versions.node" 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeVersionText)) { throw '无法读取 Node.js 版本，请重新安装 Node.js 22.12 或更高版本。' }
  $nodeVersionParts = $nodeVersionText.Trim().Split('.')
  if ($nodeVersionParts.Count -lt 3) { throw "无法识别 Node.js 版本：$nodeVersionText" }
  $nodeVersion = [version]("{0}.{1}.{2}" -f $nodeVersionParts[0], $nodeVersionParts[1], $nodeVersionParts[2])
  if ($nodeVersion -lt [version]'22.12.0') { throw "当前 Node.js 版本为 $nodeVersionText，项目至少需要 22.12.0。请升级 Node.js 后重试。" }

  Write-Section '世外墙 WFLA Wall 第一次一键配置'
  Write-Host "项目目录：$script:Root"
  Write-Host '说明：脚本只会生成本机配置和运行数据，不会把密钥上传到网络。' -ForegroundColor DarkGray

  $reuseEnv = $false
  if (Test-Path -LiteralPath $script:EnvPath) {
    Write-Host ''
    Write-Host "检测到已有配置文件：$($script:EnvPath)" -ForegroundColor Yellow
    if (-not $ForceReconfigure) {
      $overwrite = Read-YesNo '是否重新配置并覆盖 .env？' $false
      if (-not $overwrite) { $reuseEnv = $true }
    }
  }

  $originExisting = Get-DotEnvValue 'PUBLIC_ORIGIN'
  $script:WizAccessMode = if ($originExisting -and $originExisting.StartsWith('https://', [StringComparison]::OrdinalIgnoreCase)) { '3' } else { '2' }
  $portRaw = Get-DotEnvValue 'PORT'
  if ([string]::IsNullOrWhiteSpace($portRaw)) { $portRaw = '8888' }
  $script:WizPort = [int]$portRaw
  $script:WizHostAddress = Get-DotEnvValue 'HOST'
  if ([string]::IsNullOrWhiteSpace($script:WizHostAddress)) { $script:WizHostAddress = '0.0.0.0' }
  $script:WizOrigin = $originExisting
  if ([string]::IsNullOrWhiteSpace($script:WizOrigin)) { $script:WizOrigin = 'https://forum.example.com' }
  $trustRaw = Get-DotEnvValue 'TRUST_PROXY_HEADERS'
  if ([string]::IsNullOrWhiteSpace($trustRaw)) { $trustRaw = 'false' }
  $script:WizTrustProxy = $trustRaw -match '^(1|true|yes|on)$'
  $script:WizForumName = Get-DotEnvValue 'FORUM_NAME'
  if ([string]::IsNullOrWhiteSpace($script:WizForumName)) { $script:WizForumName = '世外墙 WFLA Wall' }
  $boardsRaw = Get-DotEnvValue 'WFLA_CREATE_DEFAULT_BOARDS'
  if ([string]::IsNullOrWhiteSpace($boardsRaw)) { $boardsRaw = '1' }
  $script:WizCreateBoards = $boardsRaw -eq '1'
  $script:WizAdminUser = ''
  $script:WizAdminPass = ''
  $script:WizAdminName = ''
  $script:WizAdminYear = ''
  $script:WizMsClientId = Get-DotEnvValue 'MS_CLIENT_ID'
  if ($null -eq $script:WizMsClientId) { $script:WizMsClientId = '' }
  $script:WizMsClientSecret = Get-DotEnvValue 'MS_CLIENT_SECRET'
  if ($null -eq $script:WizMsClientSecret) { $script:WizMsClientSecret = '' }
  $script:WizMsRedirectUri = Get-DotEnvValue 'MS_REDIRECT_URI'
  if ($null -eq $script:WizMsRedirectUri) { $script:WizMsRedirectUri = '' }
  $script:WizGhClientId = Get-DotEnvValue 'GITHUB_CLIENT_ID'
  if ($null -eq $script:WizGhClientId) { $script:WizGhClientId = '' }
  $script:WizGhClientSecret = Get-DotEnvValue 'GITHUB_CLIENT_SECRET'
  if ($null -eq $script:WizGhClientSecret) { $script:WizGhClientSecret = '' }
  $script:WizGhRedirectUri = Get-DotEnvValue 'GITHUB_REDIRECT_URI'
  if ($null -eq $script:WizGhRedirectUri) { $script:WizGhRedirectUri = '' }
  $script:WizLoginChoice = if ($script:WizMsClientId -and $script:WizGhClientId) { '4' } elseif ($script:WizGhClientId) { '3' } elseif ($script:WizMsClientId) { '2' } else { '1' }
  $script:WizCookieSecure = ($script:WizOrigin.StartsWith('https://', [StringComparison]::OrdinalIgnoreCase))

  if (-not $reuseEnv) {
    $step = 1
    while ($step -le 6) {
      $result = switch ($step) {
        1 { Step-Access }
        2 { Step-Site }
        3 { Step-Boards }
        4 { Step-Admin }
        5 { Step-Login }
        6 { Step-Write }
      }
      if ($result -eq 'next') { $step++ }
      else { if ($step -gt 1) { $step-- } }
    }
  } else {
    $secret = Get-DotEnvValue 'AUTH_SESSION_SECRET'
    if ([string]::IsNullOrWhiteSpace($secret)) {
      $secret = New-RandomSecret
      $lines = [IO.File]::ReadAllLines($script:EnvPath)
      $updated = foreach ($line in $lines) { if ($line -match '^\s*AUTH_SESSION_SECRET\s*=') { "AUTH_SESSION_SECRET=$secret" } else { $line } }
      [IO.File]::WriteAllLines($script:EnvPath, [string[]]$updated, (New-Object Text.UTF8Encoding($false)))
    }
    Write-Host '将保留现有 .env，仅执行迁移、构建和管理员检查。' -ForegroundColor Cyan
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

  $adminUsername = $null
  if ($reuseEnv) {
    $ownerCheckOutput = & $script:Npm --prefix $script:Root run selfhost:create-owner -- --check 2>&1
    $ownerCheckExit = $LASTEXITCODE
    $ownerExists = $ownerCheckExit -eq 0 -and (($ownerCheckOutput -join "`n") -match 'owner exists:')
    if ($ownerExists) {
      Write-Host '[跳过] 数据库中已经存在所有者账号，不会重复创建。' -ForegroundColor DarkGray
    } else {
      Write-Host '数据库中还没有所有者账号，请现在创建。' -ForegroundColor Yellow
      $adminUsername = Read-TextValue '管理员用户名' '' '^[A-Za-z0-9_]{3,32}$' '用户名格式不正确。'
      $adminPassword = Read-PasswordValue '管理员密码'
      $adminRealName = Read-TextValue '真实中文姓名（会公开展示）' '' '^[\u4E00-\u9FA5]{2,10}$' '请输入 2-10 个中文汉字。'
      $adminYear = Read-TextValue '入学届别（入学年份，例如 2026）' '' '^20\d{2}$' '届别应为 2000-2099 的四位年份。'
    }
  } else {
    $adminUsername = $script:WizAdminUser
    $adminPassword = $script:WizAdminPass
    $adminRealName = $script:WizAdminName
    $adminYear = $script:WizAdminYear
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
    & $script:Npm --prefix $script:Root run selfhost:create-owner -- --check *> $null
    if ($LASTEXITCODE -ne 0) { throw '管理员账号写入后复查失败，数据库中没有所有者。' }
    Write-Host '[完成] 管理员账号已写入数据库并完成复查。' -ForegroundColor Green
  } else {
    Write-Host '[跳过] 所有者账号已存在。' -ForegroundColor DarkGray
  }

  $finalOrigin = if ($reuseEnv) { Get-DotEnvValue 'PUBLIC_ORIGIN' } else { $script:WizOrigin }
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
