#!/bin/bash
# ============================================
#   CharWeaver - Linux 管理脚本
#   用法: ./charweaver.sh {deploy|start|stop|restart|uninstall|status}
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="charweaver"
PID_FILE="/tmp/${APP_NAME}.pid"
LOG_FILE="${SCRIPT_DIR}/server.log"
PORT=${PORT:-3000}

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ========== 环境检�?==========
check_env() {
    info "检测运行环�?.."
    
    if ! command -v node &> /dev/null; then
        error "未检测到 Node.js！请先安�?Node.js 18+"
        echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
        echo "  CentOS/RHEL:   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && sudo yum install -y nodejs"
        exit 1
    fi
    NODE_VER=$(node -v)
    NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -lt 18 ]; then
        warn "Node.js 版本较低 ($NODE_VER)，建议升级到 18+"
    fi
    info "Node.js: $NODE_VER"
    info "npm:     $(npm -v)"
    
    if command -v python3 &> /dev/null; then
        info "Python3: 已检测到（可选功能）"
    elif command -v python &> /dev/null; then
        info "Python:  已检测到（可选功能）"
    else
        warn "Python:  未检测到（可选功能，不影响核心运行）"
    fi
}

# ========== 安装依赖 ==========
install_deps() {
    info "安装项目依赖..."
    
    # 检测可用镜像源
    if npm ping --registry=https://registry.npmmirror.com &> /dev/null 2>&1; then
        REGISTRY="--registry=https://registry.npmmirror.com"
    elif npm ping --registry=https://registry.npmjs.org &> /dev/null 2>&1; then
        REGISTRY=""
    else
        REGISTRY=""
    fi
    
    npm install $REGISTRY || npm install
    info "依赖安装完成"
}

# ========== 初始化数据库 ==========
init_db() {
    info "初始化数据库..."
    npx prisma generate 2>&1 || { error "Prisma 生成失败"; exit 1; }
    npx prisma db push 2>&1 || { error "数据库初始化失败"; exit 1; }
    info "数据�? OK"
}

# ========== 配置环境变量 ==========
setup_env() {
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            warn "已从 .env.example 创建 .env 文件"
            warn "请编�?.env 填写 API Key 后重新运�?
            echo "  执行: nano .env"
        fi
    else
        info ".env 文件已存�?
    fi
}

# ========== Deploy（一键部署） ==========
cmd_deploy() {
    echo ""
    echo "============================================"
    echo "  CharWeaver - 一键部�?
    echo "============================================"
    echo ""
    
    check_env
    setup_env
    install_deps
    init_db
    
    echo ""
    info "部署完成�?
    echo ""
    echo "  启动开发模�? $0 start"
    echo "  启动生产模式: $0 start --prod"
    echo "  查看状�?     $0 status"
    echo "  停止服务:     $0 stop"
    echo "  卸载:         $0 uninstall"
    echo ""
}

# ========== Start ==========
cmd_start() {
    check_env
    
    # 检查是否已在运�?    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        warn "服务已在运行 (PID: $(cat "$PID_FILE"))"
        echo "  重启请执�? $0 restart"
        return
    fi
    
    # 检查依�?    if [ ! -d "node_modules" ]; then
        warn "node_modules 不存在，自动安装依赖..."
        install_deps
        init_db
    fi
    
    # 检�?Prisma 客户�?    if [ ! -d "node_modules/.prisma" ]; then
        warn "Prisma 客户端未生成，自动初始化..."
        init_db
    fi
    
    MODE="${2:-dev}"
    
    if [ "$MODE" = "--prod" ]; then
        info "构建生产版本..."
        npm run build || { error "构建失败"; exit 1; }
        info "启动生产服务�?(端口: $PORT)..."
        nohup npm start -- -p "$PORT" > "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        info "服务已启�?(PID: $(cat "$PID_FILE"))"
        echo "  访问地址: http://localhost:$PORT"
        echo "  日志文件: $LOG_FILE"
    else
        info "启动开发服务器 (端口: $PORT)..."
        echo "  访问地址: http://localhost:$PORT"
        echo "  �?Ctrl+C 停止"
        echo ""
        # Dev 模式前台运行
        npm run dev -- -p "$PORT"
    fi
}

# ========== Stop ==========
cmd_stop() {
    echo "停止 $APP_NAME 服务..."
    
    # 尝试�?PID 文件停止
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID" 2>/dev/null
            sleep 1
            # 强制终止
            kill -9 "$PID" 2>/dev/null || true
            info "服务已停�?(PID: $PID)"
        else
            warn "PID 文件中的进程不存�?
        fi
        rm -f "$PID_FILE"
    fi
    
    # 额外查找残留�?node 进程
    PIDS=$(pgrep -f "next.*dev" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        warn "发现残留�?Next.js 进程，正在清�?.."
        kill -9 $PIDS 2>/dev/null || true
        info "已清理残留进�?
    fi
    
    PIDS=$(pgrep -f "next.*start" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        kill -9 $PIDS 2>/dev/null || true
    fi
    
    echo "完成"
}

# ========== Restart ==========
cmd_restart() {
    cmd_stop
    sleep 1
    cmd_start "$@"
}

# ========== Status ==========
cmd_status() {
    echo "$APP_NAME 状态检�?"
    echo ""
    
    # Node.js
    if command -v node &> /dev/null; then
        echo -e "  Node.js:  $(node -v) ${GREEN}�?{NC}"
    else
        echo -e "  Node.js:  未安�?${RED}�?{NC}"
    fi
    
    # PID file
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo -e "  运行状�? ${GREEN}运行�?{NC} (PID: $PID)"
            # 端口
            PORT_INFO=$(ss -tlnp 2>/dev/null | grep "$PID" | grep -oP ':\K\d+' || lsof -i -P -n 2>/dev/null | grep "$PID" | grep -oP ':\K\d+')
            if [ -n "$PORT_INFO" ]; then
                echo "  端口:     $PORT_INFO"
            fi
        else
            echo -e "  运行状�? ${RED}未运�?{NC} (PID 文件过期)"
            rm -f "$PID_FILE"
        fi
    else
        echo -e "  运行状�? ${YELLOW}未启�?{NC}"
    fi
    
    # 依赖
    if [ -d "node_modules" ]; then
        echo -e "  依赖:     ${GREEN}已安�?{NC}"
    else
        echo -e "  依赖:     ${YELLOW}未安�?{NC}"
    fi
    
    # 数据�?    if [ -f "prisma/dev.db" ]; then
        echo -e "  数据�?   ${GREEN}已初始化${NC}"
        DB_SIZE=$(du -h "prisma/dev.db" | cut -f1)
        echo "  数据库大�? $DB_SIZE"
    else
        echo -e "  数据�?   ${YELLOW}未初始化${NC}"
    fi
    
    # .env
    if [ -f ".env" ]; then
        echo -e "  .env:     ${GREEN}已配�?{NC}"
    else
        echo -e "  .env:     ${YELLOW}未配�?{NC}"
    fi
    
    # 磁盘占用
    echo ""
    echo "  磁盘占用:"
    du -sh node_modules 2>/dev/null | awk '{print "    node_modules:  " $1}'
    du -sh .next 2>/dev/null | awk '{print "    .next:         " $1}'
    du -sh . 2>/dev/null | awk '{print "    总计:          " $1}'
}

# ========== Uninstall ==========
cmd_uninstall() {
    echo ""
    echo "============================================"
    echo "  卸载 CharWeaver"
    echo "============================================"
    echo ""
    warn "此操作将删除�?
    echo "  - node_modules/ (项目依赖)"
    echo "  - .next/        (构建缓存)"
    echo "  - prisma/dev.db (数据�?"
    echo "  - server.log    (日志)"
    echo ""
    read -p "确认卸载�?y/N): " CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        echo "已取�?
        exit 0
    fi
    
    cmd_stop
    
    echo ""
    info "删除文件..."
    rm -rf node_modules
    rm -rf .next
    rm -f prisma/dev.db
    rm -f server.log
    rm -f "$PID_FILE"
    
    echo ""
    info "卸载完成�?
    echo "  源码目录保留: $SCRIPT_DIR"
    echo "  如需完全删除，请手动执行: rm -rf \"$SCRIPT_DIR\""
}

# ========== Main ==========
case "${1:-help}" in
    deploy)
        cmd_deploy
        ;;
    start)
        cmd_start "$@"
        ;;
    stop)
        cmd_stop
        ;;
    restart)
        cmd_restart "$@"
        ;;
    status)
        cmd_status
        ;;
    uninstall)
        cmd_uninstall
        ;;
    *)
        echo "用法: $0 {deploy|start|stop|restart|status|uninstall}"
        echo ""
        echo "命令说明�?
        echo "  deploy      一键部署（检查环�?+ 安装依赖 + 初始化数据库�?
        echo "  start       启动服务（默认开发模式，�?--prod 为生产模式）"
        echo "  stop        停止服务"
        echo "  restart     重启服务"
        echo "  status      查看运行状�?
        echo "  uninstall   卸载（删除依赖、缓存、数据库�?
        echo ""
        echo "示例�?
        echo "  $0 deploy                # 一键部�?
        echo "  $0 start                 # 开发模式启�?
        echo "  $0 start --prod          # 生产模式启动"
        echo "  $0 stop                  # 停止服务"
        echo "  $0 status                # 查看状�?
        echo "  $0 uninstall             # 卸载"
        ;;
esac
