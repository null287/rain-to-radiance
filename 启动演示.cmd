@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Open http://127.0.0.1:8896/ after the server starts.
echo Camera is never opened automatically.
python download_dependencies.py --check
if errorlevel 1 (
 echo Run python download_dependencies.py first.
 pause
 exit /b 1
)
node server.mjs
pause
