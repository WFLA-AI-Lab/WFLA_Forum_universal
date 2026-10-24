@echo off
setlocal
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-with-caddy.ps1" %*
exit /b %errorlevel%