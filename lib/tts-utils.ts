/**
 * TTS 工具函数
 * - 文本分段（按句，每段 ≤60 字）
 * - 过滤括号内容
 * - 百度 TTS 直接调用（不经过 HTTP 代理到自身）
 */

// 全局 access_token 缓存
let tokenCache: { token: string; expiresAt: number } | null = null

/**
 * TTS 启用时注入的 system prompt
 */
export function getTTSSystemPrompt(): string {
  return `【重要：语音合成适配规则】
1. 每句话请控制在 60 个中文字符以内，避免超长句。
2. 如果描述动作、肢体语言、心理活动、环境等非对话内容，请放在（）内。
3. （）内的内容不会朗读，仅用于丰富表现力。
4. 代码块（\`\`\`...\`\`\`）会作为独立消息推送到前端，不会被朗读。请将重要的解释性文字放在代码块之外。
5. 如果用户要求 Markdown 文档/表格/代码范例，必须用 \`\`\`markdown 代码块包裹，不要将 Markdown 符号裸露在对话文本中。如果 Markdown 内容中包含 \`\`\` 反引号，请用反斜杠转义为 \\\`\\\`\\\`。`
}

/**
 * 获取百度 access_token（含缓存）
 */
async function getBaiduToken(apiKey: string, secretKey: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 300000) {
    return tokenCache.token
  }

  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
  const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`)

  const data = await res.json()
  if (data.error) throw new Error(`Baidu auth error: ${data.error_description || data.error}`)

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + 29 * 24 * 60 * 60 * 1000,
  }
  return data.access_token
}

/**
 * 直接调用百度 TTS API，返回 audio ArrayBuffer
 */
export async function callBaiduTTS(text: string, config: {
  appId: string
  apiKey: string
  secretKey: string
  voice: string
  speed: number
  pitch: number
  volume: number
}): Promise<ArrayBuffer | null> {
  try {
    const token = await getBaiduToken(config.apiKey, config.secretKey)
    const tex = text.slice(0, 500)

    const params = new URLSearchParams({
      tex,
      tok: token,
      cuid: `charweaver-${config.appId || 'default'}`,
      ctp: '1',
      lan: 'zh',
      spd: String(config.speed ?? 5),
      pit: String(config.pitch ?? 5),
      vol: String(config.volume ?? 5),
      per: String(config.voice ?? '0'),
      aue: '3',
    })

    const response = await fetch('https://tsn.baidu.com/text2audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(30000),
    })

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('audio')) return null

    return await response.arrayBuffer()
  } catch {
    return null
  }
}

/**
 * 将文本按句子分割为 ≤maxLen 字的段落
 * 长句在逗号/停顿处拆分，绝不截断句子
 */
export function splitTextIntoSegments(text: string, maxLen = 60): string[] {
  if (!text) return []

  // Step 0: 过滤括号内容
  let cleanText = text.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim()
  if (!cleanText) return []

  // Step 1: 按段落（双换行）分割，每个段落独立处理
  // 段落内按句末标点拆分为短句，再贪心合并（合并不跨段落）
  const result: string[] = []
  const paragraphs = cleanText.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const breakChars = new Set(['，', '、', '：', '；', '—', ' '])

  for (const para of paragraphs) {
    // 段落内按句末标点拆分
    const sentences: string[] = []
    let cur = ''
    for (const ch of para) {
      cur += ch
      if ('。！？；\n'.includes(ch)) {
        const t = cur.trim()
        if (t) sentences.push(t)
        cur = ''
      }
    }
    const rest = cur.trim()
    if (rest) sentences.push(rest)

    // 本段落内贪心合并短句；长句在逗号处拆分
    for (const s of sentences) {
      if (s.length <= maxLen) {
        const last = result[result.length - 1]
        // 不合并：当前句很短（≤10字，可能是标题残留）或合并不超上限
        if (last && s.length > 10 && last.length + s.length <= maxLen) {
          result[result.length - 1] = last + s
        } else {
          result.push(s)
        }
        continue
      }

      // 长句：在逗号等停顿处拆分
      let remain = s
      while (remain.length > maxLen) {
        const chunk = remain.slice(0, maxLen + 5)
        let splitAt = -1
        for (let i = chunk.length - 1; i >= 0; i--) {
          if (breakChars.has(chunk[i])) {
            splitAt = i + 1
            break
          }
        }
        if (splitAt <= 0 || splitAt > maxLen) splitAt = maxLen
        const part = remain.slice(0, splitAt).trim()
        if (part) result.push(part)
        remain = remain.slice(splitAt).trim()
      }
      if (remain) result.push(remain)
    }
  }

  return result.filter(s => s.length > 0)
}

export interface TextSegment {
  type: 'text' | 'code'
  content: string
  language?: string
}

/**
 * 按代码块边界分割文本
 * 代码块本身作为独立 segment，前后文本各自调用 splitTextIntoSegments 拆分
 * 效果：
 *   "前言...```code```后言..."
 *   → [{type:'text', content:'前言拆分1'}, {type:'text', content:'前言拆分2'},
 *      {type:'code', content:'```code```'}, 
 *      {type:'text', content:'后言拆分1'}, {type:'text', content:'后言拆分2'}]
 */
export function splitTextWithCodeBlocks(text: string, maxLen = 60): TextSegment[] {
  if (!text) return []

  const result: TextSegment[] = []

  // Step 1: 分割文本：代码块边界（标准 ``` 包裹）
  const parts = text.split(/(```[\s\S]*?```)/g)

  for (const raw of parts) {
    const part = raw.trim()
    if (!part) continue

    // 判断是否为代码块
    const isCode = part.startsWith('```') && part.endsWith('```') && part.length >= 6

    if (isCode) {
      // 提取语言
      const langMatch = part.match(/^```(\w+)?/)
      result.push({
        type: 'code',
        content: part,
        language: langMatch?.[1] || undefined,
      })
    } else {
      // 普通文本：进一步按长度拆分
      const subSegments = splitTextIntoSegments(part, maxLen)
      for (const seg of subSegments) {
        if (seg.trim()) {
          result.push({ type: 'text', content: seg })
        }
      }
    }
  }

  return result
}

/**
 * 合成一段语音，返回 base64 data URL（供服务端分段使用）
 */
export async function synthesizeSegment(
  text: string,
  config: {
    appId: string
    apiKey: string
    secretKey: string
    voice: string
    speed: number
    pitch: number
    volume: number
  }
): Promise<string | null> {
  try {
    const buffer = await callBaiduTTS(text, config)
    if (!buffer) return null
    
    // 校验：音频数据至少应有 100 字节
    if (buffer.byteLength < 100) {
      console.error(`TTS audio too small: ${buffer.byteLength} bytes for text: "${text}"`)
      return null
    }
    
    const base64 = Buffer.from(buffer).toString('base64')
    return `data:audio/mp3;base64,${base64}`
  } catch {
    return null
  }
}

// ============================================================
// 阿里云语音合成
// ============================================================
// Token 获取方式：REST API → nls-meta.cn-shanghai.aliyuncs.com
// WebSocket 合成：wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1
// ============================================================

interface AliyunTokenCache {
  token: string
  expiresAt: number
}

let aliyunTokenCache: AliyunTokenCache | null = null

/**
 * 生成 32 位随机 hex 字符串（阿里云要求 message_id / task_id 用此格式）
 */
function aliyunId32(): string {
  let s = ''
  for (let i = 0; i < 32; i++) {
    s += Math.floor(Math.random() * 16).toString(16)
  }
  return s
}

/**
 * RFC 3986 percent-encoding（阿里云签名专用）
 */
function pctEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~')
}

/**
 * 通过 REST API 获取阿里云 Token
 * API: GET http://nls-meta.cn-shanghai.aliyuncs.com/?{signedParams}
 * 文档: https://help.aliyun.com/zh/isi/getting-started/use-http-or-https-to-obtain-an-access-token
 */
async function getAliyunToken(accessKeyId: string, accessKeySecret: string): Promise<string | null> {
  // 检查缓存（提前 5 分钟过期）
  if (aliyunTokenCache && aliyunTokenCache.expiresAt > Date.now() + 300000) {
    return aliyunTokenCache.token
  }

  const crypto = await import('crypto')

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: 'CreateToken',
    Format: 'JSON',
    RegionId: 'cn-shanghai',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: aliyunId32() + '-' + aliyunId32().slice(0, 4) + '-' +
      aliyunId32().slice(0, 4) + '-' + aliyunId32().slice(0, 4) + '-' +
      aliyunId32().slice(0, 12),
    SignatureVersion: '1.0',
    Timestamp: now,
    Version: '2019-02-28',
  }

  const sortedKeys = Object.keys(params).sort()
  const canonicalQuery = sortedKeys.map(k => pctEncode(k) + '=' + pctEncode(params[k])).join('&')
  const stringToSign = 'GET&' + pctEncode('/') + '&' + pctEncode(canonicalQuery)
  const signature = pctEncode(
    crypto.createHmac('sha1', accessKeySecret + '&').update(stringToSign).digest('base64')
  )
  const url = `http://nls-meta.cn-shanghai.aliyuncs.com/?Signature=${signature}&${canonicalQuery}`

  try {
    const res = await fetch(url)
    const json = await res.json()
    const tokenId = json.Token?.Id
    const expireTime = json.Token?.ExpireTime
    if (tokenId && expireTime) {
      aliyunTokenCache = { token: tokenId, expiresAt: expireTime * 1000 }
      return tokenId
    }
    console.error('Aliyun token response missing Token.Id:', JSON.stringify(json))
    return null
  } catch (err) {
    console.error('Aliyun token request error:', err)
    return null
  }
}

/**
 * 调用阿里云 TTS WebSocket API，返回 MP3 ArrayBuffer
 * 使用 Node.js 原生 WebSocket（避免 ws 包的 bufferutil 在 webpack 中崩溃）
 */
export async function callAliTTS(text: string, config: {
  appkey: string
  accessKeyId: string
  accessKeySecret: string
  voice: string
  speechRate: number      // 范围 -500~500
  pitchRate: number       // 范围 -500~500
  volume: number          // 范围 0~100
  format?: 'pcm' | 'wav' | 'mp3'
  sampleRate?: number
}): Promise<ArrayBuffer | null> {
  const {
    appkey,
    accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID || '',
    accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET || '',
    voice = 'ruoxi',
    speechRate = 0,
    pitchRate = 0,
    volume = 50,
    format = 'mp3',
    sampleRate = 16000,
  } = config

  try {
    const token = await getAliyunToken(accessKeyId, accessKeySecret)
    if (!token) { console.error('Aliyun TTS: no token'); return null }

    const gateway = 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1'
    const url = `${gateway}?token=${encodeURIComponent(token)}&appkey=${encodeURIComponent(appkey)}`

    return new Promise((resolve) => {
      const chunks: Buffer[] = []
      let completed = false
      const ws = new WebSocket(url)
      ws.binaryType = 'nodebuffer'  // 确保二进制帧以 Buffer 接收

      const timeout = setTimeout(() => {
        if (!completed) { completed = true; try { ws.close() } catch {}; resolve(null) }
      }, 30000)

      ws.onopen = () => {
        ws.send(JSON.stringify({
          header: {
            message_id: aliyunId32(),
            task_id: aliyunId32(),
            appkey,
            namespace: 'SpeechSynthesizer',
            name: 'StartSynthesis',
          },
          payload: {
            text: text.slice(0, 300),
            voice, format,
            sample_rate: sampleRate,
            speech_rate: speechRate,
            pitch_rate: pitchRate,
            volume,
          },
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        const data = event.data

        // 二进制数据 → 音频片段
        if (data instanceof ArrayBuffer) {
          chunks.push(Buffer.from(data))
          return
        }
        if (Buffer.isBuffer(data)) {
          chunks.push(data)
          return
        }

        // 字符串 → 可能是 JSON 控制消息，也可能是文本帧传输的音频
        if (typeof data === 'string') {
          // 先尝试解析 JSON
          try {
            const msg = JSON.parse(data)
            const h = msg.header || {}
            if (h.name === 'TaskFailed') {
              console.error('Aliyun TTS error:', h.status_text || h.status)
              completed = true; clearTimeout(timeout); try { ws.close() } catch {}; resolve(null)
              return
            }
            if (h.name === 'SynthesisCompleted') {
              completed = true; clearTimeout(timeout); try { ws.close() } catch {}
              resolve(Buffer.concat(chunks))
              return
            }
            // 其他 JSON 消息忽略
          } catch {
            // 非 JSON 字符串 → 音频数据以文本帧传输（某些阿里云 API 版本如此）
            chunks.push(Buffer.from(data, 'utf-8'))
          }
          return
        }

        // Blob 类型兜底
        if (typeof data === 'object' && data?.arrayBuffer) {
          data.arrayBuffer().then((buf: ArrayBuffer) => {
            chunks.push(Buffer.from(buf))
          })
        }
      }

      ws.onerror = () => {
        if (!completed) { completed = true; clearTimeout(timeout); try { ws.close() } catch {}; resolve(null) }
      }

      ws.onclose = () => {
        if (!completed && chunks.length === 0) {
          completed = true; clearTimeout(timeout); resolve(null)
        }
      }
    })
  } catch (err) {
    console.error('Aliyun TTS call failed:', err)
    return null
  }
}

/**
 * 合成一段阿里云语音，返回 base64 data URL
 */
export async function synthesizeAliSegment(
  text: string,
  config: {
    appkey: string
    accessKeyId: string
    accessKeySecret: string
    voice: string
    speechRate: number
    pitchRate: number
    volume: number
    format?: 'pcm' | 'wav' | 'mp3'
    sampleRate?: number
  }
): Promise<string | null> {
  try {
    const buffer = await callAliTTS(text, config)
    if (!buffer) return null

    if (buffer.byteLength < 100) {
      console.error(`Ali TTS audio too small: ${buffer.byteLength} bytes for text: "${text}"`)
      return null
    }

    const base64 = Buffer.from(buffer).toString('base64')
    // 统一使用 audio/mp3 MIME 类型，保证浏览器能正常播放
    return `data:audio/mp3;base64,${base64}`
  } catch {
    return null
  }
}
