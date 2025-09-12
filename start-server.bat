@echo off
echo Starting AFT Server in background...

REM Kill any existing bun processes for this project
taskkill /f /im bun.exe 2>nul

REM Start the server in background without console window
start /b "" bun index.ts > server.log 2>&1

echo AFT Server started in background
echo Check server.log for output
echo To stop: taskkill /f /im bun.exe