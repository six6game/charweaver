'use client'

import { useChatStore } from '@/stores/chat-store'
import { cn, formatDate } from '@/lib/utils'
import { Send, Trash2, Bot, User, Image, Brain, Search, X, Loader2, Copy, RefreshCw, Undo2, Volume2, VolumeX, Play, Square } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './CodeBlock'
import ReasoningBox from './ReasoningBox'
import { nanoid } from 'nanoid'

interface Attachment {
  file: File
  base64: string
  preview: string
}

export default function ChatArea() {
  const { 
    currentChat, 
    setCurrentChat,
    currentAgent,
    addMessage,
    clearCurrentChat,
    modelConfigs,
    currentModel,
    setCurrentModel,
    ttsConfig
  } = useChatStore()
  
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [reasoningEnabled, setReasoningEnabled] = useState(false)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(ttsConfig.enabled)
  const [toast, setToast] = useState<string | null>(null)
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null)
  const [pendingReasoning, setPendingReasoning] = useState('')
  const [streamingContent, setStreamingContent] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)
  const streamCancelledRef = useRef(false)  // 中断标记：新请求启动前同步设置为 true，阻止旧流 done 事件写入
  const hiddenMessageIdsRef = useRef<Set<string>>(new Set())  // 被丢弃的消息 ID，永不进入渲染
  const msgCountAtRequestStartRef = useRef(0)  // 请求开始时的消息数，用于中断时标记已丢弃的回复
  const messagesEndRef = useRef<HTMLDivElement>(null)

  /**
   * setCurrentChat 的带过滤版本：写入前移除 hiddenMessageIdsRef 中的消息
   * 无论从数据库还是流式返回，被丢弃的消息永不渲染
   */
  const setCurrentChatFiltered = useCallback((chat: Chat | null) => {
    if (!chat || hiddenMessageIdsRef.current.size === 0) {
      setCurrentChat(chat)
      return
    }
    const filtered = chat.messages.filter(m => !hiddenMessageIdsRef.current.has(m.id))
    if (filtered.length === chat.messages.length) {
      setCurrentChat(chat)
    } else {
      setCurrentChat({ ...chat, messages: filtered })
    }
  }, [setCurrentChat])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sessionLoadedRef = useRef(false)  // 标记历史消息已加载完成，防止自动播放旧消息
  const playQueueRef = useRef<any[]>([])  // 顺序播放队列
  const playQueueIdxRef = useRef(0)
  const playTTSRef = useRef<((text: string, messageId: string, segments?: any[]) => void) | null>(null)

  // 顺序播放消息队列
  const playMessagesSequentially = useCallback((msgs: any[], startIdx: number) => {
    playQueueRef.current = msgs
    playQueueIdxRef.current = startIdx
    if (startIdx < msgs.length) {
      const msg = msgs[startIdx]
      
      // 跳过代码块消息（无语音内容）
      let isCodeBlock = false
      let segments: { text: string; audio: string }[] | undefined
      if (msg.metadata) {
        try {
          const meta = JSON.parse(msg.metadata)
          segments = meta.audioSegments
          isCodeBlock = meta.codeBlock === true
        } catch {}
      }

      if (isCodeBlock) {
        // 代码块消息跳过，播放下一条
        playMessagesSequentially(msgs, startIdx + 1)
        return
      }

      playTTSRef.current?.(msg.content, msg.id, segments)
    }
  }, [])
  
  // 监听播放完成，播放下一条
  useEffect(() => {
    if (playingMessageId !== null) return
    if (playQueueRef.current.length === 0) return
    const nextIdx = playQueueIdxRef.current + 1
    if (nextIdx < playQueueRef.current.length) {
      playMessagesSequentially(playQueueRef.current, nextIdx)
    } else {
      playQueueRef.current = []
      playQueueIdxRef.current = 0
    }
  }, [playingMessageId, playMessagesSequentially])

  // 停止播放
  const stopTTS = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    // 清空播放队列，防止 onended 继续播放下一条
    playQueueRef.current = []
    playQueueIdxRef.current = 0
    setPlayingMessageId(null)
  }, [])
  
  // 同步全局 TTS 开关
  useEffect(() => {
    setTtsEnabled(ttsConfig.enabled)
  }, [ttsConfig.enabled])
  
  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  
  useEffect(() => {
    scrollToBottom()
  }, [currentChat?.messages, pendingReasoning])
  
  // 自动调整textarea高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px'
    }
  }, [input])

  // 选择图片附件
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (event) => {
          const base64 = event.target?.result as string
          setAttachments(prev => [...prev, {
            file,
            base64,
            preview: URL.createObjectURL(file)
          }])
        }
        reader.readAsDataURL(file)
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }
  
  // TTS 播放（支持分段播放）
  const playTTS = useCallback(async (text: string, messageId: string, segments?: { text: string; audio: string }[]) => {
    if (!ttsConfig.enabled) return
    setPlayingMessageId(messageId)

    // 如果有预合成的音频分段，直接依次播放
    if (segments && segments.length > 0) {
      const play = async (idx: number) => {
        if (idx >= segments.length) { setPlayingMessageId(null); return }
        const seg = segments[idx]
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
        try {
          const audio = new Audio(seg.audio)
          audio.loop = false
          audioRef.current = audio
          audio.onended = () => play(idx + 1)
          audio.onerror = () => play(idx + 1)
          await audio.play()
        } catch { play(idx + 1) }
      }
      play(0)
      return
    }

    // 没有分段，直接 TTS 合成后播放
    setPlayingMessageId(messageId)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          provider: ttsConfig.provider,
          ...(ttsConfig.provider === 'aliyun' ? {
            appkey: ttsConfig.aliyunAppkey,
            accessKeyId: ttsConfig.aliyunAccessKeyId,
            accessKeySecret: ttsConfig.aliyunAccessKeySecret,
            voice: ttsConfig.aliyunVoice,
            speechRate: ttsConfig.aliyunSpeechRate,
            pitchRate: ttsConfig.aliyunPitchRate,
            volume: ttsConfig.aliyunVolume,
            format: ttsConfig.aliyunFormat,
            sampleRate: ttsConfig.aliyunSampleRate,
          } : {
            appId: ttsConfig.appId,
            apiKey: ttsConfig.apiKey,
            secretKey: ttsConfig.secretKey,
            voice: ttsConfig.voice,
            speed: ttsConfig.speed,
            pitch: ttsConfig.pitch,
            volume: ttsConfig.volume,
          }),
        }),
      })
      if (!res.ok) throw new Error('TTS failed')
      const audioBlob = await res.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      const audio = new Audio(audioUrl)
      audio.loop = false
      audioRef.current = audio
      audio.onended = () => { setPlayingMessageId(null); URL.revokeObjectURL(audioUrl) }
      audio.onerror = () => { setPlayingMessageId(null); URL.revokeObjectURL(audioUrl) }
      audio.play().catch(() => { setPlayingMessageId(null); URL.revokeObjectURL(audioUrl) })
    } catch (error) {
      console.error('TTS playback failed:', error)
      setPlayingMessageId(null)
    }
  }, [ttsConfig])

  // 同步 playTTSRef
  useEffect(() => { playTTSRef.current = playTTS }, [playTTS])

  // Toast 自动消失
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // 标记会话加载完成（防止自动播放旧消息）
  useEffect(() => {
    if (currentChat?.messages.length && !sessionLoadedRef.current) {
      const timer = setTimeout(() => { sessionLoadedRef.current = true }, 500)
      return () => clearTimeout(timer)
    }
  }, [currentChat?.id])

  const handleSend = async () => {
    // 1. 先处理中断逻辑（移到 input 检查之前！）
    //    否则加载中点击停止按钮会因为 input 为空而被提前 return
    if (isLoading) {
      streamCancelledRef.current = true
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      stopTTS()

      // 标记此请求产生的 assistant 消息 ID 为"隐藏"，永不渲染
      //    无论这些消息是已写入 zustand store（非推理快速响应），
      //    还是即将从数据库返回（新请求带回旧数据），都会被过滤掉
      const storeState = useChatStore.getState()
      const msgs = storeState.currentChat?.messages || []
      const baseCount = msgCountAtRequestStartRef.current
      for (let i = baseCount; i < msgs.length; i++) {
        if (msgs[i].role === 'assistant') {
          hiddenMessageIdsRef.current.add(msgs[i].id)
        }
      }

      setIsLoading(false)
      setPendingReasoning('')
      setStreamingContent('')

      // 如果输入框为空 → 仅中断，不发新消息
      if (!input.trim() || !currentChat || !currentAgent) return

      // 记录新请求开始前的消息数（用 zustand 最新状态）
      msgCountAtRequestStartRef.current = useChatStore.getState().currentChat?.messages.length ?? 0
    }

    // 2. 然后检查输入（只有在非加载状态下才需要）
    if (!input.trim() || !currentChat || !currentAgent) return

    const userMessage = {
      id: nanoid(),
      role: 'user' as const,
      content: input.trim(),
      createdAt: new Date().toISOString()
    }
    
    // 记录请求开始前的消息数，用于中断时剥离已完成但不应保留的回复
    // 使用 zustand 原始状态而非 React 快照，避免中断后状态未提交导致计数错误
    const storeState = useChatStore.getState()
    msgCountAtRequestStartRef.current = storeState.currentChat?.messages.length ?? 0
    addMessage(userMessage)
    const currentInput = input.trim()
    const currentAttachments = [...attachments]
    setInput('')
    setAttachments([])
    
    // 生成本次请求 ID，用于后续判断是否为最新请求
    const reqId = ++requestIdRef.current
    streamCancelledRef.current = false  // 重置取消标记，新请求可以正常处理 done 事件
    setIsLoading(true)
    setPendingReasoning('')
    setStreamingContent('')
    
    try {
      const controller = new AbortController()
      abortControllerRef.current = controller

      // 公共请求体
      const requestBody = {
        content: currentInput,
        agentId: currentAgent.id,
        model: currentModel,
        reasoning: reasoningEnabled,
        webSearch: webSearchEnabled,
        attachments: currentAttachments.map(a => ({
          type: 'image',
          base64: a.base64
        })),
      }

      if (reasoningEnabled) {
        // ===== 流式推理路径 =====
        const res = await fetch(`/api/chats/${currentChat.id}/messages/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(requestBody),
        })
        if (!res.ok) throw new Error('Stream request failed')

        const reader = res.body?.getReader()
        if (!reader) throw new Error('No stream body')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw) continue

            try {
              const event = JSON.parse(raw)

              // 如果请求已被新的请求取代，忽略旧流的数据
              if (requestIdRef.current !== reqId) break

              if (event.type === 'reasoning') {
                setPendingReasoning(prev => prev + event.content)
              } else if (event.type === 'content') {
                setStreamingContent(prev => prev + event.content)
              } else if (event.type === 'done') {
                // 如果请求已被取消或取代，不写入聊天（防止旧回复在新回复之前到达）
                if (streamCancelledRef.current || requestIdRef.current !== reqId) {
                  setStreamingContent('')
                  setPendingReasoning('')
                  continue
                }
                const prevMsgCount = currentChat.messages.length
                setCurrentChatFiltered(event.chat)
                setStreamingContent('')
                setPendingReasoning('')

                // TTS 自动播放（用过滤后的消息列表，隐藏消息不执行语音合成）
                if (ttsConfig.enabled && ttsConfig.autoPlay) {
                  const storeState = useChatStore.getState()
                  const filteredMessages = storeState.currentChat?.messages || []
                  const newAssistantMsgs = filteredMessages.slice(prevMsgCount).filter(
                    (m: any) => m.role === 'assistant'
                  )
                  if (newAssistantMsgs.length > 0) {
                    setTimeout(() => playMessagesSequentially(newAssistantMsgs, 0), 500)
                  }
                }

                // 首次对话自动生成标题
                if (prevMsgCount === 0 && userMessage.content.length > 0) {
                  const newTitle = userMessage.content.slice(0, 30) + (userMessage.content.length > 30 ? '...' : '')
                  fetch(`/api/chats/${currentChat.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: newTitle })
                  }).catch(() => {})
                }
              } else if (event.type === 'error') {
                console.error('[Stream] Error:', event.content)
                setStreamingContent('')
                addMessage({
                  id: nanoid(),
                  role: 'assistant',
                  content: `抱歉，发生了错误：${event.content}`,
                  createdAt: new Date().toISOString()
                })
              }
            } catch {}
          }
        }
      } else {
        // ===== 非流式路径（原有逻辑） =====
        const res = await fetch(`/api/chats/${currentChat.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            ...requestBody,
            ttsEnabled: ttsConfig.enabled && ttsEnabled,
            ttsConfig: (ttsConfig.enabled && ttsEnabled) ? {
              provider: ttsConfig.provider,
              appId: ttsConfig.appId,
              apiKey: ttsConfig.apiKey,
              secretKey: ttsConfig.secretKey,
              voice: ttsConfig.voice,
              speed: ttsConfig.speed,
              pitch: ttsConfig.pitch,
              volume: ttsConfig.volume,
              aliyunAppkey: ttsConfig.aliyunAppkey,
              aliyunAccessKeyId: ttsConfig.aliyunAccessKeyId,
              aliyunAccessKeySecret: ttsConfig.aliyunAccessKeySecret,
              aliyunVoice: ttsConfig.aliyunVoice,
              aliyunSpeechRate: ttsConfig.aliyunSpeechRate,
              aliyunPitchRate: ttsConfig.aliyunPitchRate,
              aliyunVolume: ttsConfig.aliyunVolume,
              aliyunFormat: ttsConfig.aliyunFormat,
              aliyunSampleRate: ttsConfig.aliyunSampleRate,
            } : undefined,
          })
        })
        
        if (!res.ok) throw new Error('Failed to send message')
        
        const data = await res.json()
        
        // 如果请求已被取消/取代，不写入聊天（防止旧回复在 strip 之后到达）
        if (streamCancelledRef.current) {
          setStreamingContent('')
          setPendingReasoning('')
          return
        }
        
        const prevMsgCount = currentChat.messages.length
        setCurrentChatFiltered(data.chat)
      
        // TTS 自动播放（用过滤后的消息列表，隐藏消息不执行语音合成）
        if (ttsConfig.enabled && ttsConfig.autoPlay) {
          const storeState = useChatStore.getState()
          const filteredMessages = storeState.currentChat?.messages || []
          const newAssistantMsgs = filteredMessages.slice(prevMsgCount).filter(
            (m: any) => m.role === 'assistant'
          )
          if (newAssistantMsgs.length > 0) {
            setTimeout(() => playMessagesSequentially(newAssistantMsgs, 0), 500)
          }
        }
      
      if (currentChat.messages.length === 0 && userMessage.content.length > 0) {
        const newTitle = userMessage.content.slice(0, 30) + (userMessage.content.length > 30 ? '...' : '')
        await fetch(`/api/chats/${currentChat.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle })
        })
      }
      }
      
    } catch (error: any) {
      // 用户主动中断（发送新消息时），不报错
      if (error?.name === 'AbortError') {
        console.log('Previous request aborted by user')
        return
      }
      console.error('Failed to send message:', error)
      addMessage({
        id: nanoid(),
        role: 'assistant',
        content: '抱歉，发送消息失败了，请检查网络连接或API配置。',
        createdAt: new Date().toISOString()
      })
    } finally {
      // 只有本次请求仍是最新请求时才清除 loading 状态
      // 避免被中断的旧请求错误地覆盖新请求的 loading 状态
      if (requestIdRef.current === reqId) {
        setIsLoading(false)
      }
    }
  }
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const copyMessage = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
    } catch (e) {
      console.error('Failed to copy:', e)
    }
  }, [])

  const handleRegenerate = useCallback(async (messageId: string) => {
    if (!currentChat || !currentAgent || isLoading) return
    setIsLoading(true)

    const msgIndex = currentChat.messages.findIndex(m => m.id === messageId)
    if (msgIndex < 0) { setIsLoading(false); return }
    
    let lastUserContent = ''
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (currentChat.messages[i].role === 'user') {
        lastUserContent = currentChat.messages[i].content
        break
      }
    }
    if (!lastUserContent) { setIsLoading(false); return }

    try {
      const res = await fetch(`/api/chats/${currentChat.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: lastUserContent,
          agentId: currentAgent.id,
          model: currentModel,
          reasoning: reasoningEnabled,
          webSearch: webSearchEnabled,
        })
      })
      if (!res.ok) throw new Error('Failed to regenerate')
      const data = await res.json()
      setCurrentChatFiltered(data.chat)
    } catch (error) {
      console.error('Failed to regenerate:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentChat, currentAgent, isLoading, reasoningEnabled, webSearchEnabled, currentModel, setCurrentChatFiltered])

  const handleWithdraw = useCallback(async (messageId: string, content: string) => {
    if (!currentChat || isLoading) return
    setInput(content)
    try {
      const res = await fetch(`/api/chats/${currentChat.id}/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId })
      })
      if (!res.ok) throw new Error('Failed to withdraw')
      const data = await res.json()
      setCurrentChatFiltered(data.chat)
      setTimeout(() => textareaRef.current?.focus(), 100)
    } catch (error) {
      console.error('Failed to withdraw:', error)
    }
  }, [currentChat, isLoading, setCurrentChat])
  
  // 无对话时的欢迎界面
  if (!currentChat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div 
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white text-2xl font-bold"
            style={{ backgroundColor: currentAgent?.avatarColor || '#6366f1' }}
          >
            {currentAgent?.name?.[0] || 'A'}
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {currentAgent ? `${currentAgent.name}，你好！` : '欢迎使用 CharWeaver'}
          </h2>
          <p className="text-muted-foreground mb-4">
            {currentAgent?.description || '选择一个角色开始对话，或创建新的AI角色'}
          </p>
          {currentAgent && (
            <div className="mt-4 space-y-2">
              {currentAgent.greeting ? (
                <p className="text-sm text-primary/80 italic">
                  "{currentAgent.greeting}"
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/70 italic">
                  "{currentAgent.systemPrompt.slice(0, 100)}..."
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Chat Header */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
            style={{ backgroundColor: currentAgent?.avatarColor || '#6366f1' }}
          >
            {currentAgent?.name?.[0] || 'A'}
          </div>
          <div>
            <div className="font-medium text-sm">{currentChat.title}</div>
            <div className="text-xs text-muted-foreground">
              {currentAgent?.name} · {currentChat.messages.length} 条消息
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          {currentChat.messages.length > 0 && (
            <>
              {/* 声音播放开关 */}
              <button
                onClick={() => {
                  const nextVal = !ttsEnabled
                  if (nextVal && reasoningEnabled) {
                    setToast('推理模式下，语音合成将在流式输出完成后自动合成')
                  }
                  if (ttsEnabled) stopTTS()
                  setTtsEnabled(nextVal)
                }}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  ttsEnabled
                    ? ttsConfig.enabled
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary opacity-40"
                    : "text-muted-foreground hover:bg-secondary"
                )}
                title={ttsEnabled ? "关闭语音" : "开启语音"}
                disabled={!ttsConfig.enabled}
              >
                {ttsEnabled && ttsConfig.enabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>
              
              {/* 清空对话 */}
              <button
                onClick={clearCurrentChat}
                className="p-2 hover:bg-secondary rounded-lg transition-colors"
                title="清空对话"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {currentChat.messages.map((message) => {
          // 提取 assistant 消息的推理内容
          let messageReasoning = ''
          if (message.role === 'assistant' && message.metadata) {
            try { messageReasoning = JSON.parse(message.metadata).reasoningContent || '' } catch {}
          }

          return (
            <div key={message.id} className="message-enter">
              {/* Assistant 消息：推理框 */}
              {messageReasoning && (
                <div className="flex gap-3 mb-1">
                  <div className="w-8 h-8 shrink-0" /> {/* 占位对齐 */}
                  <div className="flex-1">
                    <ReasoningBox content={messageReasoning} isStreaming={false} />
                  </div>
                </div>
              )}

              <div
                className={cn(
                  "flex gap-3 message-enter",
                  message.role === 'user' && "flex-row-reverse"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  message.role === 'user' ? "bg-primary" : "bg-secondary"
                )}>
                  {message.role === 'user'
                    ? <User className="w-4 h-4 text-primary-foreground" />
                    : <Bot className="w-4 h-4 text-secondary-foreground" />
                  }
                </div>

                <div className={cn(
                  "max-w-[70%] rounded-2xl px-4 py-2 group",
                  message.role === 'user'
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-secondary rounded-tl-sm"
                )}>
                  <div className="text-sm leading-relaxed">
                    {message.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '')
                            const code = String(children).replace(/\n$/, '')
                            if (match) {
                              return <CodeBlock code={code} language={match[1]} />
                            }
                            return (
                              <code className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-sm font-mono" {...props}>
                                {children}
                              </code>
                            )
                          },
                          pre({ children }) {
                            // pre 标签由 CodeBlock 内部处理，这里避免嵌套
                            return <>{children}</>
                          },
                          // 基本样式
                          p({ children }) {
                            return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                          },
                          ul({ children }) {
                            return <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>
                          },
                          ol({ children }) {
                            return <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>
                          },
                          blockquote({ children }) {
                            return <blockquote className="border-l-2 border-primary/30 pl-3 italic text-muted-foreground mb-2">{children}</blockquote>
                          },
                          h1({ children }) { return <h1 className="text-lg font-bold mb-2 mt-3">{children}</h1> },
                          h2({ children }) { return <h2 className="text-base font-bold mb-1.5 mt-2.5">{children}</h2> },
                          h3({ children }) { return <h3 className="text-sm font-bold mb-1 mt-2">{children}</h3> },
                          table({ children }) {
                            return <div className="overflow-x-auto mb-2"><table className="min-w-full border-collapse border border-border text-sm">{children}</table></div>
                          },
                          th({ children }) { return <th className="border border-border px-3 py-1.5 bg-secondary font-medium text-left">{children}</th> },
                          td({ children }) { return <td className="border border-border px-3 py-1.5">{children}</td> },
                          a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{children}</a> },
                          hr() { return <hr className="my-3 border-border" /> },
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    )}
                  </div>
                  <div className={cn(
                    "flex items-center justify-between text-xs mt-1",
                    message.role === 'user' ? "text-primary-foreground/60" : "text-muted-foreground"
                  )}>
                    <span>
                      {formatDate(message.createdAt)}
                      {message.model && ` · ${message.model}`}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* 复制按钮 */}
                      <button
                        onClick={() => copyMessage(message.content)}
                        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        title="复制"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {/* Assistant 消息：重播/停止按钮（代码块无语音） */}
                      {message.role === 'assistant' && ttsConfig.enabled && (() => {
                        // 检查是否为代码块消息（无语音）
                        let isCodeBlock = false
                        if (message.metadata) {
                          try {
                            isCodeBlock = JSON.parse(message.metadata).codeBlock === true
                          } catch {}
                        }
                        if (isCodeBlock) return null

                        return (
                          <button
                            onClick={() => {
                              if (playingMessageId === message.id) {
                                stopTTS()
                                return
                              }
                              let segments: { text: string; audio: string }[] | undefined
                              if (message.metadata) {
                                try {
                                  const meta = JSON.parse(message.metadata)
                                  segments = meta.audioSegments
                                } catch {}
                              }
                              playTTS(message.content, message.id, segments)
                            }}
                            disabled={playingMessageId !== null && playingMessageId !== message.id}
                            className={cn(
                              "p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors",
                              playingMessageId === message.id && "text-destructive"
                            )}
                            title={playingMessageId === message.id ? "停止播放" : "播放语音"}
                          >
                            {playingMessageId === message.id ? (
                              <Square className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )
                      })()}

                      {/* 用户消息：撤回编辑 */}
                      {message.role === 'user' && !isLoading && (
                        <button
                          onClick={() => handleWithdraw(message.id, message.content)}
                          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                          title="撤回编辑"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Assistant 消息：重新生成 */}
                      {message.role === 'assistant' && (
                        <button
                          onClick={() => handleRegenerate(message.id)}
                          disabled={isLoading}
                          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors disabled:opacity-30"
                          title="重新生成"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        
        {/* 当前轮的推理内容（流式中的） */}
        {(pendingReasoning || (isLoading && reasoningEnabled)) && (
          <div className="flex gap-3">
            <div className="w-8 h-8 shrink-0" /> {/* 占位对齐 */}
            <div className="flex-1">
              <ReasoningBox
                content={pendingReasoning}
                isStreaming={isLoading && reasoningEnabled}
              />
            </div>
          </div>
        )}
        
        {/* 流式中的内容预览 */}
        {streamingContent && isLoading && (
          <div className="flex gap-3 message-enter">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-secondary-foreground" />
            </div>
            <div className="bg-secondary rounded-2xl rounded-tl-sm px-4 py-2 max-w-[70%]">
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {streamingContent}
              </div>
            </div>
          </div>
        )}

        {isLoading && !streamingContent && (
          <div className="flex gap-3 message-enter">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <Bot className="w-4 h-4 text-secondary-foreground animate-pulse" />
            </div>
            <div className="bg-secondary rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="max-w-4xl mx-auto space-y-2">
          {attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {attachments.map((att, index) => (
                <div key={index} className="relative group">
                  <img
                    src={att.preview}
                    alt={att.file.name}
                    className="w-16 h-16 object-cover rounded-lg border border-border"
                  />
                  <button
                    onClick={() => removeAttachment(index)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className={cn(
                "p-2 rounded-lg transition-colors",
                attachments.length > 0
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              )}
              title="添加图片"
            >
              <Image className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const nextVal = !reasoningEnabled
                setReasoningEnabled(nextVal)
                if (nextVal) {
                  setToast('推理模式已开启，回复将流式显示')
                }
              }}
              disabled={isLoading}
              className={cn(
                "p-2 rounded-lg transition-colors text-xs flex items-center gap-1",
                reasoningEnabled
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              )}
              title="推理模式"
            >
              <Brain className={cn("w-4 h-4", reasoningEnabled && "animate-pulse")} />
              <span className="hidden sm:inline">推理</span>
            </button>
            <button
              onClick={() => setWebSearchEnabled(!webSearchEnabled)}
              disabled={isLoading}
              className={cn(
                "p-2 rounded-lg transition-colors text-xs flex items-center gap-1",
                webSearchEnabled
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              )}
              title="网络搜索"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">搜索</span>
            </button>
            <div className="flex-1" />
            <select
              value={currentModel}
              onChange={(e) => setCurrentModel(e.target.value)}
              disabled={isLoading}
              className="px-2 py-1.5 text-xs border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 max-w-[140px]"
              title="切换模型"
            >
              {modelConfigs.filter(m => m.enabled).map(m => (
                <option key={`${m.provider}-${m.name}`} value={m.name}>
                  {m.provider === 'deepseek' ? 'DS' :
                   m.provider === 'openai' ? 'OAI' :
                   m.provider === 'openai-generic' ? 'API' :
                   m.provider === 'grok' ? 'Grok' :
                   m.provider === 'anthropic' ? 'Claude' :
                   m.provider === 'ollama' ? 'Ollama' : m.provider}
                  :{m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder={isLoading ? "AI 正在回复..." : "输入消息... (Shift+Enter换行)"}
              className={cn(
                "flex-1 resize-none rounded-xl border px-4 py-3 text-sm min-h-[48px] max-h-[150px]",
                isLoading
                  ? "border-muted bg-muted/30 cursor-not-allowed text-muted-foreground"
                  : "border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              )}
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!isLoading && !input.trim()}
              className={cn(
                "p-3 rounded-xl transition-colors",
                isLoading
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
                  : !input.trim()
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              title={isLoading ? "中断当前回复并发送新消息" : "发送"}
            >
              {isLoading ? (
                <Square className="w-5 h-5" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* 浮动提示 */}
        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg text-sm text-center max-w-sm">
              {toast}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
