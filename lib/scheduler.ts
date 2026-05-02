/**
 * 用户画像自动更新调度器
 * 使用 node-cron 每日定时分析对话并更新用户画像
 * 在 instrumentation.ts 中注册，应用启动时自动运行
 */
import { prisma } from './db'
import { loadUserProfile, saveUserProfile, loadProfileConfig } from './user-profile'

// 分析用的系统提示词
const ANALYSIS_SYSTEM_PROMPT = `你是一个用户画像分析师。你需要基于用户的对话记录，分析用户的背景、偏好和习惯。
请以以下格式输出分析结果，不要包含其他内容：

## 基本信息
- 职业:
- 语言偏好:
- 技术栈:

## 性格沟通
-

## 常用功能
-

## 对话主题
-

## 学习模式
-

注意：
- 只输出上述格式的 Markdown，不要添加任何额外说明、问候、自我介绍
- 如果某个维度没有足够信息，留空即可
- 基于实际对话内容，不要编造
- 使用中文
- 你不是聊天机器人，你是一个离线分析工具，请直接输出画像结果`

/**
 * 获取默认的 API Provider 配置
 */
async function getDefaultProvider() {
  const configs = await prisma.modelConfig.findMany({
    where: { enabled: true },
    orderBy: { isDefault: 'desc' }
  })
  return configs[0] || null
}

/**
 * 调用 AI API 分析对话
 */
async function analyzeConversations(messages: { role: string; content: string }[]): Promise<string> {
  const provider = await getDefaultProvider()
  if (!provider) {
    console.error('[ProfileScheduler] No default model config found')
    return ''
  }

  // 把对话历史合并成一条消息，避免多轮 user 角色导致某些 API 报错
  const conversationText = messages.slice(-50)
    .map(m => m.content)
    .join('\n---\n')

  const apiMessages = [
    { role: 'system' as const, content: ANALYSIS_SYSTEM_PROMPT },
    { role: 'user' as const, content: `以下是最近的对话记录：\n\n${conversationText}` },
  ]

  try {
    let response: any

    if (provider.provider === 'ollama') {
      const res = await fetch(`${provider.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: provider.name, messages: apiMessages, stream: false }),
      })
      const data = await res.json()
      response = data.message?.content || ''
    } else {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (provider.apiKey) {
        headers['Authorization'] = `Bearer ${provider.apiKey}`
      }

      const requestBody = {
        model: provider.name,
        messages: apiMessages,
        temperature: 0.3,
        max_tokens: 2048,
      }

      const url = provider.baseUrl
        ? `${provider.baseUrl}/chat/completions`
        : `https://api.openai.com/v1/chat/completions`

      // 动态导入 proxy 模块
      const { getProxyUrl, socks5Fetch } = await import('./socks5')
      const proxyUrl = getProxyUrl()

      // 通用 JSON 解析器：只清理真正有害的控制字符（保留 \n \r \t）
      const extractContent = (raw: string): string => {
        // 只移除 null(0x00) 和其他真正非法的控制字符，保留 \t(0x09) \n(0x0A) \r(0x0D)
        const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        try {
          const json = JSON.parse(cleaned)
          const content = json.choices?.[0]?.message?.content
          if (typeof content === 'string' && content) return content
          // 兼容 Ollama 格式
          const msgContent = json.message?.content
          if (typeof msgContent === 'string' && msgContent) return msgContent
        } catch (parseErr) {
          // JSON 解析失败，尝试括号匹配提取 JSON（兼容 socks5 代理返回的多余内容）
          const jsonMatch = matchFirstJsonObject(cleaned)
          if (jsonMatch) {
            try {
              const json = JSON.parse(jsonMatch)
              const content = json.choices?.[0]?.message?.content
              if (typeof content === 'string' && content) return content
            } catch { /* 括号提取的也解析不了，放弃 */ }
          }
          console.error('[ProfileScheduler] JSON parse failed, raw length:', cleaned.length)
          console.error('[ProfileScheduler] First 300 chars:', cleaned.slice(0, 300))
        }
        return ''
      }

      /**
       * 从可能包含多余文本的字符串中，通过括号深度匹配提取第一个完整的 JSON 对象
       */
      function matchFirstJsonObject(text: string): string | null {
        const start = text.indexOf('{')
        if (start === -1) return null
        let depth = 0
        let inString = false
        let escape = false
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

      if (proxyUrl) {
        const bodyText = JSON.stringify(requestBody)
        const responseText = await socks5Fetch(proxyUrl, url, {
          headers, body: bodyText
        })
        const jsonStart = responseText.indexOf('{')
        if (jsonStart >= 0) {
          response = extractContent(responseText.substring(jsonStart))
        }
      } else {
        const res = await fetch(url, {
          method: 'POST', headers, body: JSON.stringify(requestBody),
        })
        if (!res.ok) throw new Error(`API error ${res.status}`)
        response = extractContent(await res.text())
      }
    }

    return response || ''
  } catch (err) {
    console.error('[ProfileScheduler] Analysis API call failed:', err)
    return ''
  }
}

/**
 * 执行用户画像更新
 */
async function runProfileUpdate() {
  console.log('[ProfileScheduler] Starting profile update...')
  try {
    // 检查配置：是否启用
    const config = loadProfileConfig()
    if (!config.enabled) {
      console.log('[ProfileScheduler] Profile update is disabled, skipping')
      return
    }

    // 动态导入 proxy（避免 instrumentation.ts webpack 打包 child_process）
    const proxy = await import('./proxy')
    proxy.ensureProxyEnv()

    // 读取最近 3 天的对话（仅 user 和 assistant 消息）
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const recentMessages = await prisma.message.findMany({
      where: {
        createdAt: { gte: threeDaysAgo },
        role: { in: ['user', 'assistant'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })

    if (recentMessages.length < 3) {
      console.log('[ProfileScheduler] Not enough messages to analyze (need at least 3)')
      return
    }

    // 提取纯文本消息用于分析
    // 重要：所有消息都用 "user" 角色发送，避免 AI 把自己当成对话参与者而闲聊
    const analysisMessages = recentMessages.map(m => ({
      role: 'user' as const,
      content: `${m.role === 'user' ? '用户' : 'AI'}: ${m.content
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .slice(0, 500)}`,
    }))

    // 调用 AI 分析
    console.log(`[ProfileScheduler] Analyzing ${analysisMessages.length} messages...`)
    // console.log('[ProfileScheduler] Sample messages:', analysisMessages.slice(0, 3).map(m => m.content.slice(0, 80)))
    const analysisResult = await analyzeConversations(analysisMessages)
    if (!analysisResult) {
      console.log('[ProfileScheduler] Analysis returned empty result')
      return
    }

    // 验证：分析结果必须包含用户画像的关键段落标记
    // 防止 socks5 代理返回了请求体内容导致写入错误数据
    if (!analysisResult.includes('## 基本信息') && !analysisResult.includes('## 性格沟通')) {
      console.log('[ProfileScheduler] Analysis result validation failed - not a valid profile')
      console.log('[ProfileScheduler] First 200 chars:', analysisResult.slice(0, 200))
      return
    }

    // 读取现有画像，保留更新时间和头部
    const existingProfile = loadUserProfile()
    const hasExistingData = existingProfile && existingProfile.trim()

    // 写入新画像
    const newProfile = `# 用户画像

最后更新: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

${analysisResult.trim()}
`
    saveUserProfile(newProfile)
    console.log('[ProfileScheduler] Profile updated successfully')
  } catch (err) {
    console.error('[ProfileScheduler] Failed:', err)
  }
}

/**
 * 根据配置计算下次运行间隔（毫秒）
 */
function computeNextInterval(): number {
  const config = loadProfileConfig()
  if (!config.enabled) return 24 * 60 * 60 * 1000 // 禁用了也每天检查一次配置

  if (config.scheduleType === 'fixed') {
    // 固定时间：计算到下次指定时间的毫秒数
    const [h, m] = config.fixedTime.split(':').map(Number)
    const now = new Date()
    const next = new Date(now)
    next.setHours(h, m, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    return next.getTime() - now.getTime()
  } else {
    // 间隔模式
    const ms = config.intervalUnit === 'minutes'
      ? config.intervalValue * 60 * 1000
      : config.intervalValue * 60 * 60 * 1000
    return Math.max(ms, 60000) // 最少 1 分钟
  }
}

/**
 * 注册用户画像更新调度器
 * 根据配置动态安排下次运行时间
 */
let initialized = false

export function initProfileScheduler() {
  if (initialized) return
  initialized = true

  // 启动后延迟 30 秒先执行一次
  setTimeout(() => {
    runProfileUpdate()
    // 执行完后安排下次
    scheduleNext()
  }, 30000)

  console.log('[ProfileScheduler] Initialized (startup delay 30s)')
}

function scheduleNext() {
  const config = loadProfileConfig()
  if (!config.enabled) {
    // 未启用，1 小时后重检查
    setTimeout(() => { scheduleNext() }, 60 * 60 * 1000)
    console.log('[ProfileScheduler] Disabled, will recheck in 1 hour')
    return
  }

  const interval = computeNextInterval()
  const nextDate = new Date(Date.now() + interval)
  console.log(`[ProfileScheduler] Next update scheduled at ${nextDate.toLocaleString('zh-CN')}`)

  setTimeout(() => {
    runProfileUpdate()
    scheduleNext()  // 执行完继续安排下次
  }, interval)
}
