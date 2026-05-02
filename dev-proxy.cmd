@echo off
title CharWeaver (with Proxy)
cd /d "%~dp0"
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
echo [Proxy] HTTP_PROXY=%HTTP_PROXY%
echo.
npm run dev
