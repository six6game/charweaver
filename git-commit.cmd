@echo off
chcp 65001 >nul
title CharWeaver - Version Manager

echo ================================
echo   CharWeaver - Git Commit Tool
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

:: Init repo if needed
if not exist ".git" (
    git init
    echo [OK] Git repo initialized
)

:: Show status
echo.
echo Current changes:
git status --short
echo.

:: Get commit message
set /p COMMIT_MSG="Enter commit message (leave empty for auto): "

if "%COMMIT_MSG%"=="" set COMMIT_MSG=update: %date% %time%

:: Commit
git add -A
git commit -m "%COMMIT_MSG%"

if %errorlevel% equ 0 (
    echo.
    echo [OK] Commit successful!
    git log --oneline -3
) else (
    echo.
    echo [!] Nothing to commit or commit failed
)

echo.
pause
