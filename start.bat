@echo off
title 3D Flip Library
echo ==========================================
echo       STARTING 3D FLIP LIBRARY
echo ==========================================
echo.

:: Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/ first.
    echo.
    pause
    exit /b
)

:: Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo [INFO] Installing required packages...
    call npm install --prefix .
    echo.
)

:: Start browser in 2 seconds
echo [INFO] Starting local server at http://localhost:3000...
timeout /t 2 /nobreak >nul
start http://localhost:3000

:: Run dev server
npm run dev
