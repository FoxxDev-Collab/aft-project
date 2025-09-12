@echo off
echo Restarting AFT Server...

REM Stop existing server
taskkill /f /im bun.exe 2>nul

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Start server again
start /b "" bun index.ts > server.log 2>&1

echo AFT Server restarted in background
echo Check server.log for output