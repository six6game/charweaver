/**
 * 流式推理 API 路由
 * 当 reasoning=true 时，使用流式接口返回推理内容和回复内容
 * 流格式: text/event-stream
 *   data: {"type":"reasoning","content":"思考片段"}
 *   data: {"type":"content","content":"回复片段"}
 *   data: {"type":"done","chat":{...}}
 */
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getSearchSystemPrompt } from '@/lib/web-search'
import { ensureProxyEnv } from '@/lib/proxy'
import { getProfileSystemPrompt } from '@/lib/user-profile'
import { getAgentMemorySystemPrompt } from '@/lib/agent-memory'
import OpenAI from 'openai'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    ensureProxyEnv()
    const body = await request.json()
    const { content, agentId, reasoning, webSearch, attachments, model: selectedModel } = body

    const chat = await prisma.chat.findUnique({
      where: { id: params.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    })
    if (!chat) {
      return new Response(JSON.stringify({ error: 'Chat not found' }), { status: 404 })
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId || chat.agentId }
    })

    // 保存用户消息
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
    if (agent?.systemPrompt) {
      messages.push({ role: 'system', content: agent.systemPrompt })
    }
    // 代码块格式提示
    messages.push({ role: 'system', content: '【代码格式要求】所有代码片段必须使用标准 Markdown 代码块包裹，格式：```语言名\\n代码内容\\n```。特别地，如果用户要求 Markdown 文档/表格等范例，必须将内容放在 ```markdown 代码块中，不要将 Markdown 符号直接裸露在对话文本中。注意：如果 markdown 内容本身包含 ``` 反引号，必须将其转义为 \\`\\`\\`，避免与代码块标记冲突。行内代码使用单个反引号 `code`。' })
    const profilePrompt = getProfileSystemPrompt()
    if (profilePrompt) {
      messages.push({ role: 'system', content: profilePrompt })
    }

    // 注入角色记忆
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

    // 添加当前用户消息
    if (attachments?.length) {
      const contentParts: any[] = [{ type: 'text', text: content }]
      for (const att of attachments) {
        if (att.type === 'image' && att.base64) {
          contentParts.push({ type: 'image_url', image_url: { url: att.base64 } })
        }
      }
      messages.push({ role: 'user', content: contentParts })
    } else {
      messages.push({ role: 'user', content })
    }

    // 获取模型配置
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
      const searchPrompt = getSearchSystemPrompt(content)
      messages.push({ role: 'system', content: searchPrompt })
      searchResults = searchPrompt
    }

    // ====== 使用 OpenAI SDK 流式调用 ======
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let fullReasoning = ''
        let fullContent = ''

        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          const client = new OpenAI({
            apiKey,
            baseURL: baseUrl,
          })

          const streamOptions: any = {
            model,
            messages,
            stream: true,
            reasoning_effort: 'high',
            thinking: { type: 'enabled' },  // 直接在 body 中传递
          }

          const streamResponse = await client.chat.completions.create(streamOptions)

          for await (const chunk of streamResponse) {
            const delta = chunk.choices?.[0]?.delta || {}
            if (delta.reasoning_content) {
              fullReasoning += delta.reasoning_content
              send({ type: 'reasoning', content: delta.reasoning_content })
            }
            if (delta.content) {
              fullContent += delta.content
              send({ type: 'content', content: delta.content })
            }
          }

          // 降级：若流式结束内容为空，去掉推理参数重试
          if (!fullContent && reasoning && provider === 'deepseek') {
            send({ type: 'reasoning', content: '（推理不可用，自动降级）' })
            const fallbackClient = new OpenAI({ apiKey, baseURL: baseUrl })
            const fallbackRes = await fallbackClient.chat.completions.create({
              model, messages, stream: false
            })
            fullContent = fallbackRes.choices?.[0]?.message?.content || ''
          }

          const assistantMeta: any = { reasoning, webSearch }
          if (searchResults) assistantMeta.searchPrompt = searchResults
          if (fullReasoning) assistantMeta.reasoningContent = fullReasoning

          const assistantMsg = await prisma.message.create({
            data: {
              chatId: params.id,
              role: 'assistant',
              content: fullContent,
              model,
              metadata: JSON.stringify(assistantMeta),
            }
          })

          // 更新 chat 标题
          if (chat.messages.length === 0 && content.length > 0) {
            const newTitle = content.slice(0, 30) + (content.length > 30 ? '...' : '')
            await prisma.chat.update({
              where: { id: params.id },
              data: { title: newTitle, updatedAt: new Date() }
            })
          } else {
            await prisma.chat.update({
              where: { id: params.id },
              data: { updatedAt: new Date() }
            })
          }

          // 获取完整 chat 返回前端
          const updatedChat = await prisma.chat.findUnique({
            where: { id: params.id },
            include: { messages: { orderBy: { createdAt: 'asc' } } }
          })

          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'done', chat: updatedChat, userMessage })}\n\n`
          ))
          controller.close()

        } catch (err: any) {
          console.error('[Stream] Error:', err)
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', content: err.message || 'Stream failed' })}\n\n`
          ))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })

  } catch (err: any) {
    console.error('[Stream] Fatal error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
