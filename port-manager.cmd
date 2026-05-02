@echo off
title CharWeaver - Port Manager

:menu
cls
echo.
echo  ========================================
echo       Port Manager Tool
echo  ========================================
echo.
echo  1. Check port 3000 status
echo  2. Kill process on port 3000
echo  3. List Node.js processes
echo  4. Kill all Node.js
echo  5. Exit
echo.
echo  ========================================
echo.

set /p choice="Select (1-5): "

if "%choice%"=="1" goto check
if "%choice%"=="2" goto kill
if "%choice%"=="3" goto list
if "%choice%"=="4" goto killall
if "%choice%"=="5" goto end
goto menu

:check
cls
echo.
echo Checking port 3000...
echo.
netstat -ano | findstr :3000
if %errorlevel% neq 0 (
    echo.
    echo Port 3000 is FREE
) else (
    echo.
    echo Port 3000 is IN USE
)
echo.
pause
goto menu

:kill
cls
echo.
echo Searching port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo.
    echo Process PID: %%a
    tasklist /FI "PID eq %%a"
    setlocal enabledelayedexpansion
    set "PID=%%a"
    echo.
    set /p c="Kill PID !PID! ? (y/n): "
    if /i "!c!"=="y" (
        taskkill /F /PID !PID!
        echo Killed!
    )
    endlocal
)
echo.
pause
goto menu

:list
cls
echo.
echo Node.js processes:
echo.
tasklist /FI "IMAGENAME eq node.exe"
echo.
pause
goto menu

:killall
cls
echo.
set /p c="Kill ALL Node.js? (y/n): "
if /i not "%c%"=="y" goto menu
echo.
taskkill /F /IM node.exe
echo.
echo Done!
pause
goto menu

:end
