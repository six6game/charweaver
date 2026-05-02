# CharWeaver 🎭

> 多角色 · 多模型 · 多会话 —— 下一代 AI 助手平台

**CharWeaver**（原名 Agent Web）是一个功能丰富的 AI 对话平台，支持**自定义角色（Agent）系统**、**多模型切换**（DeepSeek / OpenAI / Anthropic / Grok / Ollama）、**推理模式**、**联网搜索**、**语音合成（TTS）**、**自动记忆与用户画像分析**等能力。开箱即用，支持 Windows 一键部署和 Linux 管理脚本。

---

## ✨ 功能亮点

### 🎭 深度角色系统
不只是「系统提示词」。每个 Agent 拥有完整的角色定义体系：名称、开场白、性格描述、背景故事、心智模型（多个思维模型）、决策启发式（If-Then 规则）、表达 DNA（词汇/口头禅/风格）、价值观、反模式、内在张力、知识边界。系统提示词自动生成器会将结构化设定编译为高质量的 Markdown 提示词。

### 🧠 推理模式
支持 DeepSeek、Grok 等模型的流式推理。实时输出思考过程，自动折叠展开，支持复制推理内容。推理不可用时自动降级。

### 🌐 联网搜索
通过 system prompt 注入触发模型联网搜索能力，支持阿里云百炼、腾讯云、DeepSeek 和 xAI Grok 等多平台。

### 🗣️ 语音合成（TTS）
支持百度语音和阿里云语音双引擎。自动文本分段（每段 ≤60 字），代码块跳过朗读，括号内容不朗读，顺序播放消息队列，自动/手动播放控制。

### 💾 自动记忆系统
每个 Agent 拥有独立自动记忆能力。定时调度分析近期对话，生成主题摘要和关键要点。可配置固定时间或间隔模式。

### 👤 用户画像分析
系统自动分析所有对话，构建用户画像。涵盖基本信息、沟通风格、常用功能、对话主题等维度。定时更新（默认每日凌晨 2:00），自动注入到所有 Agent 的 system prompt。

### 🔌 多模型支持
- **DeepSeek**: V4 Flash / V4 Pro（1M 上下文）
- **OpenAI**: GPT-4o / GPT-4 Turbo / GPT-3.5
- **OpenAI 通用**: 兼容任意 OpenAI 格式 API
- **Grok (xAI)**: Grok 4.20 Reasoning（2M 上下文）
- **Anthropic**: Claude 3.5 Sonnet / Claude 3 Opus
- **Ollama**: Llama 3 / Mistral / Qwen 2（本地运行）

### 🛠️ 更多特性
- 图片附件支持
- 流式推理回复
- 消息复制、重新生成、撤回编辑
- 暗色/亮色/跟随系统三档主题
- 内置 SOCKS5 代理隧道
- 系统代理自动检测

---

## 🚀 快速开始

### 前置要求
- **Node.js 18+**（推荐 20+）
- **npm**

### Windows 一键部署

```bash
# 在项目目录下双击 install.bat
install.bat
```

### Linux / macOS 部署

```bash
chmod +x charweaver.sh
./charweaver.sh deploy   # 一键部署
./charweaver.sh start    # 开发模式启动
./charweaver.sh start --prod  # 生产模式启动
./charweaver.sh stop     # 停止服务
./charweaver.sh restart  # 重启
./charweaver.sh status   # 查看状态
./charweaver.sh uninstall # 卸载
```

### 手动安装

```bash
npm install
npm run db:generate
npm run db:push
npm run dev    # 启动开发服务器
```

访问 **http://localhost:3000**

---

## 📂 项目结构

```
charweaver/
├── app/                        # Next.js App Router
│   ├── page.tsx                # 主页面
│   ├── layout.tsx              # 根布局
│   ├── globals.css             # 全局样式
│   └── api/                    # API Routes
│       ├── agents/             # Agent CRUD + 记忆 API
│       ├── chats/              # 对话管理 + 流式推理
│       ├── models/             # 模型配置
│       ├── init/               # 默认数据初始化
│       ├── profile/            # 用户画像
│       ├── run-python/         # Python 脚本执行
│       └── tts/                # 语音合成
├── components/
│   ├── chat/                   # 聊天区域、推理框、代码块
│   ├── sidebar/                # 侧边栏
│   ├── agents/                 # Agent 管理弹窗
│   └── settings/               # 设置面板
├── lib/
│   ├── db.ts                   # Prisma 客户端
│   ├── models/adapters.ts      # 6种模型适配器
│   ├── prompt-generator.ts     # 提示词生成器/解析器
│   ├── agent-memory.ts         # Agent 记忆管理
│   ├── agent-memory-scheduler.ts  # 记忆调度器
│   ├── user-profile.ts         # 用户画像
│   ├── scheduler.ts            # 画像调度器
│   ├── tts-utils.ts            # TTS 引擎
│   ├── web-search.ts           # 联网搜索
│   ├── proxy.ts                # 系统代理检测
│   ├── socks5.ts               # SOCKS5 隧道
│   └── theme.ts                # 主题管理
├── stores/chat-store.ts        # Zustand 状态管理
├── prisma/schema.prisma        # 数据库 Schema
├── install.bat                 # Windows 安装
├── charweaver.sh               # Linux 管理脚本
└── start.cmd                   # Windows 启动
```

---

## 🧩 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| UI | React 18 + TailwindCSS 3 |
| 数据库 | SQLite + Prisma ORM |
| 状态管理 | Zustand |
| Markdown | react-markdown + remark-gfm |
| AI SDK | OpenAI SDK（通用兼容层） |
| 图标 | Lucide React |

---

## 📜 License

---
