@echo off
setlocal
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0一键启动.ps1" %*
set "code=%errorlevel%"
if not "%code%"=="0" (
  echo.
  echo 启动失败，错误码：%code%
  echo 请把本窗口中的错误信息发给管理员。
  pause
)
exit /b %code%