@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0apps\infra\scripts\host-lifecycle.ps1" -Action setup
exit /b %errorlevel%
