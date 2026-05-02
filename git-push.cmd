@echo off
chcp 65001 >nul
title CharWeaver - Git Push

echo ================================
echo   CharWeaver - Git Push Tool
echo ================================
echo.

cd /d "%~dp0"

:: Check Git
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git not found! Install from:
    echo   https://git-scm.com/downloads
    pause
    exit /b 1
)

set /p MSG="Enter commit message: "

if "%MSG%"=="" set MSG=update: %date% %time%

echo.
echo [1/3] Adding files...
git add -A

echo [2/3] Committing...
git commit -m "%MSG%"

if %errorlevel% neq 0 (
    echo [!] Nothing to commit or commit failed
    pause
    exit /b 0
)

echo [3/3] Pushing to GitHub (via proxy)...
git -c http.proxy=socks5://127.0.0.1:7897 push

if %errorlevel% equ 0 (
    echo.
    echo [OK] Pushed successfully!
    git log --oneline -3
) else (
    echo.
    echo [ERROR] Push failed. Check your internet or GitHub token.
)

echo.
pause
