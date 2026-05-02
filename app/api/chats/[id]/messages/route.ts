import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSearchSystemPrompt, formatSearchResults } from '@/lib/web-search'
import { ensureProxyEnv } from '@/lib/proxy'
import { socks5Fetch, getProxyUrl } from '@/lib/socks5'
import { getTTSSystemPrompt, splitTextWithCodeBlocks, synthesizeSegment, synthesizeAliSegment } from '@/lib/tts-utils'
import { getProfileSystemPrompt } from '@/lib/user-profile'
import { getAgentMemorySystemPrompt } from '@/lib/agent-memory'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    ensureProxyEnv()
    
    // 懒初始化用户画像调度器（后台定时分析对话）
    import('@/lib/scheduler').then(({ initProfileScheduler }) => {
      initProfileScheduler()
    }).catch(() => {})
    
    const body = await request.json()
    const { content, agentId, reasoning, webSearch, attachments, model: selectedModel, ttsEnabled, ttsConfig } = body
    
    // 获取对话
    const chat = await prisma.chat.findUnique({
      where: { id: params.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } }
      }
    })
    
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }
    
    // 获取Agent配置
    const agent = await prisma.agent.findUnique({
      where: { id: agentId || chat.agentId }
    })
    
    // 保存用户消息（含 metadata）
    const userMetadata: any = {}
    if (attachments?.length) userMetadata.attachments = attachments
    if (reasoning) userMetadata.reasoning = true
    if (webSearch) userMetadata.webSearch = true

    const userMessage = await prisma.message.create({
      data: {
        chatId: params.id,
        role: 'user',
        content,
        metadata: Object.keys(userMetadata).length ? JSON.stringify(userMetadata) : null
      }
    })
    
    // 构建消息历史
    const messages: any[] = []
    
    // 添加系统提示
    if (agent?.systemPrompt) {
      messages.push({ role: 'system', content: agent.systemPrompt })
    }
    // 代码块格式提示
    messages.push({ role: 'system', content: '【代码格式要求】所有代码片段必须使用标准 Markdown 代码块包裹，格式：```语言名\\n代码内容\\n```。特别地，如果用户要求 Markdown 文档/表格等范例，必须将内容放在 ```markdown 代码块中，不要将 Markdown 符号直接裸露在对话文本中。注意：如果 markdown 内容本身包含 ``` 反引号，必须将其转义为 \\`\\`\\`，避免与代码块标记冲突。行内代码使用单个反引号 `code`。' })
    // TTS 启用时注入语音合成适配规则
    if (ttsEnabled) {
      messages.push({ role: 'system', content: getTTSSystemPrompt() })
    }

    // 注入用户画像（帮助 AI 了解用户偏好和背景）
    const profilePrompt = getProfileSystemPrompt()
    if (profilePrompt) {
      messages.push({ role: 'system', content: profilePrompt })
    }

    // 注入角色记忆（帮助 AI 了解近期与该角色聊过什么）
    if (agent) {
      const memoryPrompt = getAgentMemorySystemPrompt(agent.id, agent.name)
      if (memoryPrompt) {
        messages.push({ role: 'system', content: memoryPrompt })
      }
    }
    
    // 添加历史消息
    for (const msg of chat.messages) {
      messages.push({ role: msg.role, content: msg.content })
    }
    
    // 添加当前用户消息 — 如果有附件，转为多模态格式
    if (attachments?.length) {
      const contentParts: any[] = [{ type: 'text', text: content }]
      for (const att of attachments) {
        if (att.type === 'image' && att.base64) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: att.base64 }
          })
        }
      }
      messages.push({ role: 'user', content: contentParts })
    } else {
      messages.push({ role: 'user', content })
    }
    
    // 获取模型配置：优先使用前端选择的模型，否则用默认
    let modelConfig
    if (selectedModel) {
      modelConfig = await prisma.modelConfig.findFirst({
        where: { name: selectedModel, enabled: true }
      })
    }
    if (!modelConfig) {
      modelConfig = await prisma.modelConfig.findFirst({
        where: { enabled: true, isDefault: true }
      })
    }
    
    const provider = modelConfig?.provider || 'deepseek'
    const apiKey = modelConfig?.apiKey || process.env.DEEPSEEK_API_KEY || ''
    const baseUrl = modelConfig?.baseUrl || 'https://api.deepseek.com'
    const model = modelConfig?.name || 'deepseek-v4-flash'

    // 联网搜索提示
    let searchResults: string | null = null
    if (webSearch) {
      // 注入搜索指令到 system message
      const searchPrompt = getSearchSystemPrompt(content)
      messages.push({ role: 'system', content: searchPrompt })
      searchResults = searchPrompt // 记录到 metadata
    }

    let aiResponseContent = ''

    try {
      if (provider === 'ollama') {
        // Ollama 使用独立 API
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            options: {
              temperature: agent?.temperature || 0.7,
              num_predict: agent?.maxTokens || 4096,
            }
          })
        })
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || 'Ollama API request failed')
        }
        const data = await response.json()
        aiResponseContent = data.message?.content || ''
      } else if (provider === 'grok') {
        // xAI Grok 使用 /v1/responses 端点；input 为字符串（将对话历史拼接）
        const conversationText = messages.map(m =>
          `${m.role === 'user' ? '用户' : m.role === 'system' ? '系统' : 'AI'}: ${typeof m.content === 'string' ? m.content : ''}`
        ).join('\n')

        const grokBody: any = {
          model,
          input: conversationText
        }
        const grokUrl = `${baseUrl}/responses`
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }

        const proxyUrl = getProxyUrl()
        if (proxyUrl) {
          // 通过 SOCKS5 代理请求 Grok API
          const bodyText = JSON.stringify(grokBody)
          const responseText = await socks5Fetch(proxyUrl, grokUrl, {
            headers,
            body: bodyText
          })
          aiResponseContent = parseGrokResponse(responseText)
        } else {
          // 直连（无代理时）
          const res = await fetch(grokUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(grokBody)
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error((err as any).error?.message || `Grok API error ${res.status}`)
          }
          const data = await res.json()
          aiResponseContent = data.output?.[0]?.content?.[0]?.text || data.text || ''
        }
      } else {
        // OpenAI 兼容格式：DeepSeek / OpenAI / OpenAIGeneric
        const requestBody: any = {
          model,
          messages,
          temperature: agent?.temperature || 0.7,
          max_tokens: agent?.maxTokens || 4096,
          stream: false
        }

        // DeepSeek 专用参数
        if (provider === 'deepseek') {
          if (reasoning) {
            requestBody.reasoning_effort = 'high'
            requestBody.thinking = { type: 'enabled' }
          }
          if (webSearch) {
            requestBody.enable_search = true
          }
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error?.message || `API request failed (${response.status})`)
        }

        const data = await response.json()
        aiResponseContent = data.choices?.[0]?.message?.content || ''

        // 降级：推理模式返回空内容时，去掉推理参数重试
        if (!aiResponseContent && reasoning && provider === 'deepseek') {
          console.log('[Messages] Empty response with reasoning, retrying without reasoning')
          const retryBody = { ...requestBody, reasoning_effort: undefined, stream: false }
          const retryRes = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(retryBody),
          })
          if (retryRes.ok) {
            const retryData = await retryRes.json()
            aiResponseContent = retryData.choices?.[0]?.message?.content || ''
          }
        }
      }
    } catch (apiError: any) {
      console.error('API call failed:', apiError)
      aiResponseContent = `抱歉，发生了错误：${apiError.message}`
    }

    // 保存AI响应
    const assistantMetadata: any = { reasoning, webSearch }
    if (searchResults) assistantMetadata.searchPrompt = searchResults

    // TTS 分段 → 创建多条独立消息
    let assistantMessages: any[] = []

    // 统一 TTS 合成函数（根据 provider 选择百度或阿里云）
    const doSynth = async (text: string, cfg: any) => {
      if (!cfg || !text) return null
      if (cfg.provider === 'aliyun') {
        return synthesizeAliSegment(text, {
          appkey: cfg.aliyunAppkey,
          accessKeyId: cfg.aliyunAccessKeyId || process.env.ALIYUN_ACCESS_KEY_ID || '',
          accessKeySecret: cfg.aliyunAccessKeySecret || process.env.ALIYUN_ACCESS_KEY_SECRET || '',
          voice: cfg.aliyunVoice || 'xiaoyun',
          speechRate: cfg.aliyunSpeechRate ?? 0,
          pitchRate: cfg.aliyunPitchRate ?? 0,
          volume: cfg.aliyunVolume ?? 50,
          format: cfg.aliyunFormat || 'mp3',
          sampleRate: cfg.aliyunSampleRate || 16000,
        })
      } else {
        return synthesizeSegment(text, {
          appId: cfg.appId,
          apiKey: cfg.apiKey,
          secretKey: cfg.secretKey,
          voice: cfg.voice,
          speed: cfg.speed,
          pitch: cfg.pitch,
          volume: cfg.volume,
        })
      }
    }

    const doCreateSingle = async (filteredText?: string) => {
      const meta: any = { reasoning, webSearch }
      if (searchResults) meta.searchPrompt = searchResults

      // 即使是单段也要过滤 () 内容并合成 TTS 音频
      if (filteredText && ttsConfig) {
        const audio = await doSynth(filteredText, ttsConfig)
        if (audio) {
          meta.audioSegments = [{ text: filteredText, audio }]
        }
      }

      const msg = await prisma.message.create({
        data: {
          chatId: params.id,
          role: 'assistant',
          content: aiResponseContent,
          model,
          metadata: JSON.stringify(meta),
        }
      })
      assistantMessages = [msg]
    }

    if (ttsEnabled && ttsConfig && aiResponseContent) {
      const maxLen = 60
      const textSegments = splitTextWithCodeBlocks(aiResponseContent, maxLen)

      if (textSegments.length > 1) {
        // 多段：每段独立消息，代码块不合成语音
        for (const seg of textSegments) {
          const meta: any = { reasoning, webSearch }
          if (searchResults) meta.searchPrompt = searchResults

          if (seg.type === 'text') {
            // 文本段：合成语音
            const audio = await doSynth(seg.content, ttsConfig)
            if (audio) {
              meta.audioSegments = [{ text: seg.content, audio }]
            }
          } else {
            // 代码块段：标记为无语音消息，前端不显示播放按钮
            meta.codeBlock = true
          }

          const msg = await prisma.message.create({
            data: {
              chatId: params.id,
              role: 'assistant' as const,
              content: seg.content,
              model,
              metadata: JSON.stringify(meta),
            }
          })
          assistantMessages.push(msg)
        }
      } else {
        // 只有一段：检查是否为代码块，代码块不合成语音
        const firstSeg = textSegments[0]
        if (firstSeg?.type === 'code') {
          const meta: any = { reasoning, webSearch, codeBlock: true }
          if (searchResults) meta.searchPrompt = searchResults
          const msg = await prisma.message.create({
            data: {
              chatId: params.id,
              role: 'assistant' as const,
              content: firstSeg.content,
              model,
              metadata: JSON.stringify(meta),
            }
          })
          assistantMessages = [msg]
        } else {
          await doCreateSingle(firstSeg?.content)
        }
      }
    } else {
      await doCreateSingle()
    }

    // 更新对话时间
    await prisma.chat.update({
      where: { id: params.id },
      data: { updatedAt: new Date() }
    })

    return NextResponse.json({
      userMessage,
      assistantMessages: assistantMessages.length > 1 ? assistantMessages : undefined,
      assistantMessage: assistantMessages.length === 1 ? assistantMessages[0] : undefined,
      chat: await prisma.chat.findUnique({
        where: { id: params.id },
        include: { messages: { orderBy: { createdAt: 'asc' } } }
      })
    })

  } catch (error) {
    console.error('Failed to send message:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}

// 从 Grok Responses API 的 HTTP 响应体中提取 JSON 并解析内容
function parseGrokResponse(httpBody: string): string {
  try {
    // 去掉 HTTP 头部（如果有）
    const jsonStart = httpBody.indexOf('{')
    if (jsonStart === -1) return httpBody
    const json = JSON.parse(httpBody.substring(jsonStart))
    return json.output?.[0]?.content?.[0]?.text || json.text || httpBody
  } catch {
    return httpBody
  }
}

// DELETE - 撤回消息：删除指定消息及其之后的所有消息
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { messageId } = body
    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
    }

    // 找到目标消息
    const targetMessage = await prisma.message.findUnique({
      where: { id: messageId }
    })
    if (!targetMessage || targetMessage.chatId !== params.id) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // 删除该消息及之后的所有消息
    await prisma.message.deleteMany({
      where: {
        chatId: params.id,
        createdAt: { gte: targetMessage.createdAt }
      }
    })

    // 更新对话时间
    await prisma.chat.update({
      where: { id: params.id },
      data: { updatedAt: new Date() }
    })

    return NextResponse.json({
      chat: await prisma.chat.findUnique({
        where: { id: params.id },
        include: { messages: { orderBy: { createdAt: 'asc' } } }
      })
    })
  } catch (error) {
    console.error('Failed to withdraw message:', error)
    return NextResponse.json({ error: 'Failed to withdraw message' }, { status: 500 })
  }
}
