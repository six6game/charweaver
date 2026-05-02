# 架构概览

## 整体架构

```
Frontend (React + TailwindCSS)
  ├── Sidebar (Agent/会话列表)
  ├── ChatArea (消息/推理/流式)
  └── Settings (模型/TTS/主题)
        │
        ▼
API Routes (Next.js App Router)
  ├── /api/agents       → Agent CRUD + 记忆
  ├── /api/chats        → 对话管理 + 流式推理
  ├── /api/models       → 模型配置
  ├── /api/tts          → 语音合成
  ├── /api/profile      → 用户画像
  └── /api/init         → 默认数据初始化
        │
        ▼
Lib Layer
  ├── models/adapters   → 6种模型适配器
  ├── agent-memory*     → 记忆管理/调度
  ├── user-profile      → 用户画像
  ├── tts-utils         → 语音合成引擎
  ├── proxy/socks5      → 网络代理
  └── prompt-generator  → 提示词生成
        │
        ▼
Database (SQLite + Prisma) ←→ File System (.memory/)
```

## 数据流

### 消息发送（推理模式）
```
输入 → Zustand Store → fetch API →
  → Prisma 保存用户消息 → 构建 System Prompt →
  → 注入：角色设定 + 用户画像 + Agent 记忆 →
  → OpenAI SDK 流式调用 AI API →
  → SSE 流返回前端（推理内容/回复内容/完成事件）→
  → Prisma 保存完整回复 → 更新界面
```

### 自动记忆
```
定时触发 → 读取近期对话 → AI 分析 →
  → 生成摘要 → 写入 .memory/agents/{id}/AGENT_MEMORY.md →
  → 下次对话注入 System Prompt
```

### 用户画像
```
定时触发（默认每日 02:00）→ 读取所有对话 →
  AI 分析（基本信息/性格/主题）→
  写入 .memory/USER_PROFILE.md →
  后续所有对话自动注入
```

## 多模型适配器

所有适配器实现统一接口 `ModelAdapter`，通过工厂方法创建：

- DeepSeekAdapter → DeepSeek API
- OpenAIAdapter → OpenAI API
- OpenAIGenericAdapter → 任意 OpenAI 格式 API
- AnthropicAdapter → Claude API
- GrokAdapter → xAI API
- OllamaAdapter → 本地 Ollama

## 数据库 Schema

- **Agent**: 角色定义（心智模型、表达 DNA、知识边界等存储为 JSON 字符串）
- **Chat**: 对话会话（关联 Agent）
- **Message**: 消息记录（支持 metadata JSON 存储推理/搜索/附件信息）
- **ModelConfig**: 模型配置（支持多提供商、多模型）

## 文件系统存储

```
.memory/
├── USER_PROFILE.md           # 用户画像
├── PROFILE_CONFIG.json       # 调度配置
└── agents/{agentId}/
    ├── AGENT_MEMORY.md       # Agent 记忆
    └── MEMORY_CONFIG.json    # 记忆调度配置
```

## 代理方案

1. **系统代理检测**: 读取 Windows 注册表自动设置 HTTP_PROXY
2. **SOCKS5 隧道**: 纯 Node.js 实现，无第三方依赖，支持 TLS 加密
