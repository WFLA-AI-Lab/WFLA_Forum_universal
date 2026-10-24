@echo off
setlocal
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0一键启动.ps1" %*
exit /b %errorlevel%
