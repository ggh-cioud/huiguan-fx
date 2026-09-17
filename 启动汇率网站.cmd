@echo off
cd /d "%~dp0"
call npm.cmd run start -- --port 5173
pause
