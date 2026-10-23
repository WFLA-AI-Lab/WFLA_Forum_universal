#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot\..
if (-not (Test-Path .env)) { throw 'Missing .env. Copy .env.selfhost.example to .env first.' }
npm run selfhost:start