@echo off
title CharWeaver - Uninstall

cd /d "%~dp0"

cls
echo.
echo  ========================================
echo       Uninstall CharWeaver
echo  ========================================
echo.
echo  This will delete:
echo   - node_modules
echo   - .next (cache)
echo   - prisma/dev.db (database)
echo   - .env (config)
echo.
set /p confirm="Continue? (y/n): "

if /i not "%confirm%"=="y" (
    echo Cancelled.
    pause
    exit /b 0
)

echo.

if exist "node_modules" (
    echo Removing node_modules...
    rmdir /s /q "node_modules"
)

if exist ".next" (
    echo Removing .next cache...
    rmdir /s /q ".next"
)

if exist "prisma\dev.db" (
    echo Removing database...
    del /q "prisma\dev.db"
)

if exist ".env" (
    echo Removing .env config...
    del /q ".env"
)

echo.
echo  ========================================
echo       Uninstall Complete!
echo  ========================================
echo.
pause
