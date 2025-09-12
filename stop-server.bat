@echo off
echo Stopping AFT Server...
taskkill /f /im bun.exe 2>nul
echo AFT Server stopped