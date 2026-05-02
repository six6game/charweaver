/**
 * TTS API Route - 百度/阿里云 短文本语音合成
 */
import { NextRequest, NextResponse } from 'next/server'
import { callBaiduTTS, splitTextWithCodeBlocks } from '@/lib/tts-utils'
import { callAliTTS } from '@/lib/tts-utils'

/**
 * 预处理 TTS 文本：过滤括号内容、跳过代码块、合理分段后拼接
 * 兼容推理模式（前端直接传原文）和非推理模式（服务端已预处理但 fallback 到此处）
 */
function preprocessTTSText(rawText: string): string {
  const segments = splitTextWithCodeBlocks(rawText)
  const textParts = segments
    .filter(s => s.type === 'text')
    .map(s => s.content)
  // splitTextWithCodeBlocks 内部已调用 splitTextIntoSegments（含括号过滤）
  return textParts.join('')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text: rawText, provider = 'baidu' } = body

    if (!rawText) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    // 预处理文本：移除括号内容、跳过代码块
    const text = preprocessTTSText(rawText)
    if (!text.trim()) {
      return NextResponse.json({ error: 'No speakable text after preprocessing' }, { status: 400 })
    }

    let audioBuffer: ArrayBuffer | null = null
    let contentType = 'audio/mp3'

    if (provider === 'aliyun') {
      // 阿里云 TTS - UI 输入优先，环境变量兜底
      const { appkey, accessKeyId: bodyAkId, accessKeySecret: bodyAkSecret, voice, speechRate, pitchRate, volume, format, sampleRate } = body
      const accessKeyId = bodyAkId || process.env.ALIYUN_ACCESS_KEY_ID || ''
      const accessKeySecret = bodyAkSecret || process.env.ALIYUN_ACCESS_KEY_SECRET || ''
      if (!appkey || !accessKeyId || !accessKeySecret) {
        return NextResponse.json({ error: 'Aliyun appkey is required (AccessKey 请配置在环境变量 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET)' }, { status: 400 })
      }
      audioBuffer = await callAliTTS(text, {
        appkey,
        accessKeyId,
        accessKeySecret,
        voice: voice || 'xiaoyun',
        speechRate: speechRate ?? 0,
        pitchRate: pitchRate ?? 0,
        volume: volume ?? 50,
        format: format || 'mp3',
        sampleRate: sampleRate || 16000,
      })
      contentType = format === 'pcm' ? 'audio/pcm' : format === 'wav' ? 'audio/wav' : 'audio/mp3'
    } else {
      // 百度 TTS（默认）
      const { appId, apiKey, secretKey, voice, speed, pitch, volume } = body
      if (!apiKey || !secretKey) {
        return NextResponse.json({ error: 'API Key and Secret Key are required' }, { status: 400 })
      }
      audioBuffer = await callBaiduTTS(text, { appId, apiKey, secretKey, voice, speed, pitch, volume })
    }

    if (!audioBuffer) {
      return NextResponse.json({ error: 'TTS synthesis failed' }, { status: 502 })
    }

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': audioBuffer.byteLength.toString(),
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error: any) {
    console.error('TTS API failed:', error)
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'TTS request timed out' }, { status: 504 })
    }
    return NextResponse.json(
      { error: error.message || 'TTS request failed' },
      { status: 500 }
    )
  }
}
