@echo off
chcp 65001 >nul
title CharWeaver - 一键部署安装程序
echo ============================================
echo   CharWeaver - 一键部署安装程序
echo ============================================
echo.

cd /d "%~dp0"

:: ========== 1. 检测 Node.js ==========
echo [1/5] 检测运行环境...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 Node.js！
    echo 请先安装 Node.js 18+：https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=1,2,3 delims=." %%a in ('node -v') do (
    set NODE_MAJOR=%%a
)
set NODE_MAJOR=%NODE_MAJOR:v=%
if %NODE_MAJOR% LSS 18 (
    echo [WARN] Node.js 版本较低（%NODE_MAJOR%），建议使用 18+
)

node -v
echo Node.js 版本: OK

:: 检测 npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 npm！
    pause
    exit /b 1
)
call npm -v
echo npm 版本: OK

:: 检测 Python（可选）
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo Python: 已检测到（可选功能）
) else (
    echo Python: 未检测到（可选功能，不影响核心运行）
)

:: ========== 2. 配置环境变量 ==========
echo.
echo [2/5] 检查环境变量配置...
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo 已从 .env.example 创建 .env 文件
        echo 请编辑 .env 填写 API Key 后重启脚本
        echo.
        echo 按任意键用记事本打开 .env 进行编辑...
        pause >nul
        notepad ".env"
    ) else (
        echo [WARN] 未找到 .env.example，跳过环境变量配置
    )
) else (
    echo .env 文件已存在，跳过
)

:: ========== 3. 安装依赖 ==========
echo.
echo [3/5] 安装项目依赖...
echo 正在安装 npm 包（使用淘宝镜像加速）...
call npm install --registry=https://registry.npmmirror.com
if %errorlevel% neq 0 (
    echo [WARN] 淘宝镜像安装失败，尝试官方源...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install 失败！
        pause
        exit /b 1
    )
)
echo 依赖安装完成

:: ========== 4. 初始化数据库 ==========
echo.
echo [4/5] 初始化数据库...
call npx prisma generate >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Prisma 客户端生成失败！
    pause
    exit /b 1
)
echo Prisma 客户端: OK

call npx prisma db push >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 数据库初始化失败！
    pause
    exit /b 1
)
echo 数据库: OK

:: ========== 5. 构建生产版本（可选）==========
echo.
echo [5/5] 构建选择...
echo.
echo 请选择启动模式：
echo   [1] 开发模式（自动热重载，适合修改代码）
echo   [2] 生产模式（高性能，需先构建）
echo   [3] 退出
echo.

choice /c 123 /n /m "请输入选项 (1/2/3): "
if errorlevel 3 goto :eof
if errorlevel 2 goto :build_prod
if errorlevel 1 goto :dev_mode

:build_prod
echo.
echo 正在构建生产版本...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] 构建失败！
    pause
    exit /b 1
)
echo 构建完成！
echo.
echo 启动服务器...
start http://localhost:3000
call npm run start
goto :eof

:dev_mode
echo.
echo 启动开发服务器...
start http://localhost:3000
call npm run dev
goto :eof
