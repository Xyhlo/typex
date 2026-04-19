@echo off
setlocal

:: ============================================================
::  TypeX — Tauri Dev (full desktop app)
::  Double-click to launch TypeX in dev mode with hot reload.
::  Close the TypeX window (or press Ctrl+C here) to stop.
::
::  First launch compiles the Rust backend (~2 min). After that,
::  frontend edits hot-reload instantly and only Rust-side edits
::  trigger a recompile.
:: ============================================================

cd /d "%~dp0"

echo.
echo   TypeX  -  Tauri Dev
echo   -------------------
echo   First launch compiles Rust (~2 min). After that, live reload.
echo   Stop: close the TypeX window, or Ctrl+C in this console.
echo.

:: Put Node + Cargo on PATH defensively. Tauri needs both.
if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
)
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

:: Sanity: make sure cargo is resolvable before we go further.
where cargo >nul 2>nul
if errorlevel 1 (
    echo   ERROR: Rust toolchain ^(cargo^) not found on PATH.
    echo   Install from https://rustup.rs then run this again.
    echo.
    pause
    exit /b 1
)

:: Install JS deps on a fresh clone.
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

:: Download the bundled Pandoc sidecar on first run if not already there.
if not exist "src-tauri\binaries" (
    echo   No Pandoc sidecar yet. Fetching ^(~40 MB download^)...
    call npm run fetch-pandoc
    if errorlevel 1 (
        echo   fetch-pandoc failed, but continuing anyway — you'll get a
        echo   "Pandoc not found" warning inside the app until you run it
        echo   manually ^("npm run fetch-pandoc"^).
        echo.
    )
)

:: Launch.
call npm run tauri:dev

if errorlevel 1 (
    echo.
    echo   tauri:dev exited with an error. Press any key to close.
    pause >nul
)

endlocal
