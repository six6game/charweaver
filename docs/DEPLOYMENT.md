# 部署指南

## 系统要求

- Node.js 18+（推荐 20 LTS）
- npm 9+
- 内存 512MB+，磁盘 500MB+
- Python 可选（仅 run-python 功能需要）

## Windows 部署

### 一键安装
双击 `install.bat`，自动完成环境检测 → 创建 .env → 安装依赖 → 初始化数据库 → 选择启动模式。

### 快速启动
```bash
start.cmd
```

### 手动
```bash
npm install
npm run db:generate
npm run db:push
npm run dev
```

## Linux 部署

```bash
chmod +x charweaver.sh

# 一键部署
./charweaver.sh deploy

# 管理
./charweaver.sh start            # 开发模式
./charweaver.sh start --prod     # 生产模式
./charweaver.sh stop
./charweaver.sh restart
./charweaver.sh status           # 详细状态
./charweaver.sh uninstall
```

## 生产环境建议

### 端口
```bash
PORT=8080 ./charweaver.sh start --prod
```

### PM2 进程管理
```bash
npm install -g pm2
pm2 start npm --name "charweaver" -- start
pm2 save
pm2 startup
```

### Nginx 反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| DEEPSEEK_API_KEY | 推荐 | DeepSeek API Key |
| OPENAI_API_KEY | 可选 | OpenAI API Key |
| ANTHROPIC_API_KEY | 可选 | Anthropic Claude |
| PORT | 可选 | 端口（默认 3000） |

## 数据库

使用 SQLite，无需额外服务。

```bash
npm run db:generate   # 生成 Prisma 客户端
npm run db:push       # 推送 Schema
npm run db:studio     # 图形化管理
```

数据库文件位于 `prisma/dev.db`。

## 常见问题

**Q: 启动后白屏？**
A: 删除 `.next` 目录后重新构建。

**Q: API 报网络错误？**
A: 检查 API Key 是否正确；国内访问海外 API 需配置代理。

**Q: 重置所有数据？**
```bash
rm prisma/dev.db && npm run db:push
```
