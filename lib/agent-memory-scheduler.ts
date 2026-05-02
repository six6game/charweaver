/**
 * 角色记忆自动更新调度器
 * 每个角色独立调度，定时分析与该角色的对话，生成主题摘要
 * 注册方式：在 config API 中懒加载 initAgentMemoryScheduler(agentId)
 */
import { prisma } from './db'
import { loadAgentMemoryConfig, saveAgentMemoryConfig, saveAgentMemory } from './agent-memory'

// 分析用的系统提示词
const MEMORY_ANALYSIS_SYSTEM_PROMPT = `你是一个对话摘要分析师。你需要基于用户与某个AI角色的对话记录，分析这段时间讨论了什么主题和关键要点。
请以以下格式输出分析结果，不要包含其他内容：

## 近期对话摘要
最后更新: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

### 对话主题
- 用一句话概括一个讨论过的主题

### 关键要点
- 从对话中提取的关键信息、用户偏好、重要决定

注意：
- 只输出上述格式的 Markdown，不要添加任何额外说明、问候、自我介绍
- 每个主题/要点用一句话概括，不要保留对话原文
- 如果对话内容不足以支持某个维度，留空即可
- 基于实际对话内容，不要编造
- 使用中文
- 你不是聊天机器人，你是一个离线分析工具，请直接输出分析结果`

/**
 * 运行一次角色记忆更新
 */
export async function runAgentMemoryUpdate(agentId: string): Promise<boolean> {
  try {
    const config = loadAgentMemoryConfig(agentId)
    if (!config.enabled) return false

    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) return false

    // 读取最近 7 天的对话（仅与该角色的对话）
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentMessages = await prisma.message.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        role: { in: ['user', 'assistant'] },
        chat: { agentId },
      },
      include: { chat: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })

    if (recentMessages.length < 3) return false

    // 合并为一条 user 消息发送
    const conversationText = recentMessages
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').slice(0, 500)}`)
      .join('\n---\n')

    // 调用 AI API 分析
    const analysisResult = await analyzeMemory(conversationText)
    if (!analysisResult) return false

    // 写入记忆文件
    saveAgentMemory(agentId, analysisResult.trim())
    saveAgentMemoryConfig(agentId, { lastUpdated: new Date().toISOString() })
    console.log(`[AgentMemory] Memory updated for agent ${agentId} (${agent.name})`)
    return true
  } catch (err) {
    console.error(`[AgentMemory] Failed for agent ${agentId}:`, err)
    return false
  }
}

/**
 * 调用 AI API 分析对话记忆
 */
async function analyzeMemory(conversationText: string): Promise<string> {
  const provider = await getDefaultProvider()
  if (!provider) return ''

  const messages = [
    { role: 'system' as const, content: MEMORY_ANALYSIS_SYSTEM_PROMPT },
    { role: 'user' as const, content: `以下是最近与某个AI角色的对话记录：\n\n${conversationText}` },
  ]

  try {
    if (provider.provider === 'ollama') {
      const res = await fetch(`${provider.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: provider.name, messages, stream: false }),
      })
      const data = await res.json()
      return data.message?.content || ''
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`

    const url = provider.baseUrl
      ? `${provider.baseUrl}/chat/completions`
      : `https://api.openai.com/v1/chat/completions`

    const { getProxyUrl, socks5Fetch } = await import('./socks5')
    const proxyUrl = getProxyUrl()

    const requestBody = {
      model: provider.name,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
    }

    let responseText: string
    if (proxyUrl) {
      responseText = await socks5Fetch(proxyUrl, url, {
        headers,
        body: JSON.stringify(requestBody),
      })
    } else {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      responseText = await res.text()
    }

    return extractContent(responseText)
  } catch (err) {
    console.error('[AgentMemory] API call failed:', err)
    return ''
  }
}

/**
 * 从 API 响应中提取 JSON content
 */
function extractContent(raw: string): string {
  const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  try {
    const json = JSON.parse(cleaned)
    const content = json.choices?.[0]?.message?.content
    if (typeof content === 'string' && content) return content
    const msgContent = json.message?.content
    if (typeof content === 'string' && msgContent) return msgContent
  } catch {
    // 括号匹配兜底
    const matched = matchFirstJsonObject(cleaned)
    if (matched) {
      try {
        const json = JSON.parse(matched)
        const content = json.choices?.[0]?.message?.content
        if (typeof content === 'string' && content) return content
      } catch {}
    }
  }
  return ''
}

function matchFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0, inString = false, escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.substring(start, i + 1)
    }
  }
  return null
}

/**
 * 获取默认的 API Provider
 */
async function getDefaultProvider() {
  const configs = await prisma.modelConfig.findMany({
    where: { enabled: true },
    orderBy: { isDefault: 'desc' },
  })
  return configs[0] || null
}

// ============================================================
// 调度器管理
// ============================================================

const schedulers = new Map<string, { timeout: NodeJS.Timeout; running: boolean }>()

/**
 * 初始化某个角色的记忆调度器
 */
export function initAgentMemoryScheduler(agentId: string) {
  // 如果已存在调度器，先停止
  stopAgentMemoryScheduler(agentId)

  const config = loadAgentMemoryConfig(agentId)
  if (!config.enabled) return

  const interval = computeNextInterval(config)
  const timeout = setTimeout(async () => {
    const entry = schedulers.get(agentId)
    if (entry) entry.running = true
    await runAgentMemoryUpdate(agentId)
    if (entry) entry.running = false
    // 安排下一次
    initAgentMemoryScheduler(agentId)
  }, interval)

  schedulers.set(agentId, { timeout, running: false })
}

/**
 * 停止某个角色的记忆调度器
 */
export function stopAgentMemoryScheduler(agentId: string) {
  const existing = schedulers.get(agentId)
  if (existing) {
    clearTimeout(existing.timeout)
    schedulers.delete(agentId)
  }
}

function computeNextInterval(config: ReturnType<typeof loadAgentMemoryConfig>): number {
  if (!config.enabled) return 24 * 60 * 60 * 1000

  if (config.scheduleType === 'fixed') {
    const [h, m] = config.fixedTime.split(':').map(Number)
    const now = new Date()
    const next = new Date(now)
    next.setHours(h, m, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    return next.getTime() - now.getTime()
  }

  const ms = config.intervalUnit === 'minutes'
    ? config.intervalValue * 60 * 1000
    : config.intervalValue * 60 * 60 * 1000
  return Math.max(ms, 60000)
}
