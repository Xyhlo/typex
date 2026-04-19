@echo off
setlocal

:: ============================================================
::  TypeX — Local Dev Server
::  Double-click to start Vite at http://localhost:1420
::  Press Ctrl+C in this window to stop.
::
::  Browser-only paste / UI testing. File open/save and other
::  Tauri APIs are stubbed in browser mode — for those, run
::  `npm run tauri:dev` instead (slower, compiles Rust).
:: ============================================================

cd /d "%~dp0"

echo.
echo   TypeX  -  Local Dev Server
echo   --------------------------
echo   URL:   http://localhost:1420
echo   Stop:  Ctrl+C
echo.

:: Make sure Node is on PATH even if cmd was spawned by something
:: that stripped it (the Git Bash / older installer dance).
if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
)

:: Kill any stale process still holding port 1420 from a previous run.
for /f "tokens=5" %%a in ('netstat -ano -p tcp ^| findstr ":1420 "') do (
    if not "%%a"=="0" (
        echo   Port 1420 held by PID %%a. Releasing it...
        taskkill /F /PID %%a >nul 2>&1
    )
)

:: Install deps if this is a fresh clone.
if not exist "node_modules" (
    echo   node_modules is missing, running "npm install" first...
    call npm install
    if errorlevel 1 (
        echo.
        echo   npm install failed. Press any key to close.
        pause >nul
        exit /b 1
    )
    echo.
)

:: Run Vite and auto-open the browser once ready.
call npx vite --port 1420 --strictPort --open

:: Keep the window visible if the server exits with an error so you can
:: read the stack trace.
if errorlevel 1 (
    echo.
    echo   Dev server exited with an error. Press any key to close.
    pause >nul
)

endlocal
