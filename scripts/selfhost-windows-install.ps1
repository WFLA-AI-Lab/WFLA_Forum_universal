#!/usr/bin/env pwsh
# WFLA Wall self-host install helper for Windows Server / Windows 10 / Windows 11.
# Run once in an elevated PowerShell only if you want it to start at boot.
param(
  [string]$InstallRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) {
  Write-Host 'This helper is written for PowerShell 7+. Use pwsh, not Windows PowerShell 5.1.'
  exit 1
}

$root = (Resolve-Path $InstallRoot).ProviderPath
if (-not (Test-Path (Join-Path $root 'package.json'))) { throw "package.json not found in $root" }

# Copy production frontend output to the expected public directory.
# Get-ChildItem + Copy-Item avoids the Windows PowerShell quirk where
# Copy-Item -LiteralPath does not expand a trailing wildcard.
$frontendDist = Join-Path $root 'frontend\dist'
$publicDir = Join-Path $root 'public'
if (-not (Test-Path -LiteralPath $frontendDist)) { throw "frontend/dist not found: $frontendDist. Build the frontend before installing." }
New-Item -ItemType Directory -Force -Path $publicDir | Out-Null
Get-ChildItem -LiteralPath $publicDir -Force | Remove-Item -Recurse -Force
Get-ChildItem -LiteralPath $frontendDist -Force | Copy-Item -Destination $publicDir -Recurse -Force
Write-Host 'public/ updated from frontend/dist'

# Register a scheduled task running under the current user at logon.
$action = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WorkingDirectory `"$root`" -File `"$root\scripts\selfhost-windows-run.ps1`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'WFLA Wall SelfHost' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host 'Scheduled task registered: WFLA Wall SelfHost'