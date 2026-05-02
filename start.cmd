@echo off
title CharWeaver - Startup
set HTTP_PROXY=socks5://127.0.0.1:7897
set HTTPS_PROXY=socks5://127.0.0.1:7897
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js not found!
    pause
    exit
)

REM Kill any existing Node processes
taskkill /F /IM node.exe >nul 2>&1

echo Cleaning up...
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install --registry=https://registry.npmmirror.com
    if errorlevel 1 (
        echo [ERROR] npm install failed!
        pause
        exit
    )
) else (
    echo node_modules already exists, skipping install.
)

echo.
echo Initializing database...
call npx prisma generate >nul 2>&1
call npx prisma db push >nul 2>&1

echo.
echo ================================
echo  Server: http://localhost:3000
echo  Ctrl+C to stop
echo ================================
echo.
start http://localhost:3000
npm run dev