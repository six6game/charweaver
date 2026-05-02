import OpenAI from 'openai'

export interface ModelAdapter {
  provider: string
  name: string
  apiKey: string
  baseUrl: string
  
  createClient(): OpenAI | any
  chat(messages: Array<{role: string, content: string}>, options?: {
    temperature?: number
    maxTokens?: number
    stream?: boolean
    reasoning?: boolean
    enableSearch?: boolean
  }): Promise<any>
}

// DeepSeek 适配器
export class DeepSeekAdapter implements ModelAdapter {
  provider = 'deepseek'
  name = 'DeepSeek-V4-Flash'
  apiKey: string
  baseUrl = 'https://api.deepseek.com'
  
  constructor(apiKey: string, baseUrl?: string, modelName?: string) {
    this.apiKey = apiKey
    if (baseUrl) this.baseUrl = baseUrl
    if (modelName) this.name = modelName
  }
  
  createClient() {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      dangerouslyAllowBrowser: true,
    })
  }
  
  async chat(messages: Array<{role: string, content: string}>, options?: {
    temperature?: number
    maxTokens?: number
    stream?: boolean
    reasoning?: boolean
    enableSearch?: boolean
  }) {
    const client = this.createClient()
    return client.chat.completions.create({
      model: this.name,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: options?.stream ?? false,
    }, {
      headers: options?.reasoning ? { 'X-Reasoning-Mode': 'true' } as any : undefined
    } as any)
  }
}

// OpenAI 适配器
export class OpenAIAdapter implements ModelAdapter {
  provider = 'openai'
  name = 'gpt-4o'
  apiKey: string
  baseUrl = 'https://api.openai.com/v1'
  
  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey
    if (baseUrl) this.baseUrl = baseUrl
  }
  
  createClient() {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      dangerouslyAllowBrowser: true,
    })
  }
  
  async chat(messages: Array<{role: string, content: string}>, options?: {
    temperature?: number
    maxTokens?: number
    stream?: boolean
    reasoning?: boolean
    enableSearch?: boolean
  }) {
    const client = this.createClient()
    return client.chat.completions.create({
      model: this.name,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: options?.stream ?? false,
    })
  }
}

// Anthropic Claude 适配器
export class AnthropicAdapter implements ModelAdapter {
  provider = 'anthropic'
  name = 'claude-3-5-sonnet-20240620'
  apiKey: string
  baseUrl = 'https://api.anthropic.com/v1'
  
  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey
    if (baseUrl) this.baseUrl = baseUrl
  }
  
  createClient() {
    // 返回一个简化版本，实际项目可以用 @anthropic-ai/sdk
    return {
      apiKey: this.apiKey
    }
  }
  
  async chat(messages: Array<{role: string, content: string}>, options?: {
    temperature?: number
    maxTokens?: number
    stream?: boolean
    reasoning?: boolean
    enableSearch?: boolean
  }) {
    // 简化实现，实际项目需要使用 Anthropic SDK
    throw new Error('Anthropic adapter needs @anthropic-ai/sdk')
  }
}

// Ollama 本地模型适配器
export class OllamaAdapter implements ModelAdapter {
  provider = 'ollama'
  name = 'llama3'
  apiKey = ''
  baseUrl = 'http://localhost:11434'
  
  constructor(baseUrl?: string) {
    if (baseUrl) this.baseUrl = baseUrl
  }
  
  createClient() {
    return {
      baseUrl: this.baseUrl
    }
  }
  
  async chat(messages: Array<{role: string, content: string}>, options?: {
    temperature?: number
    maxTokens?: number
    stream?: boolean
    reasoning?: boolean
    enableSearch?: boolean
  }) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: this.name,
        messages,
        stream: options?.stream ?? false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 4096,
        }
      })
    })
    return response.json()
  }
}

// Grok (xAI) 适配器
export class GrokAdapter implements ModelAdapter {
  provider = 'grok'
  name = 'grok-4.20-0309-reasoning'
  apiKey: string
  baseUrl = 'https://api.x.ai/v1'

  constructor(apiKey: string, baseUrl?: string, modelName?: string) {
    this.apiKey = apiKey
    if (baseUrl) this.baseUrl = baseUrl
    if (modelName) this.name = modelName
  }

  createClient() {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      dangerouslyAllowBrowser: true,
    })
  }

  async chat(messages: Array<{role: string, content: string}>, options?: {
    temperature?: number
    maxTokens?: number
    stream?: boolean
    reasoning?: boolean
    enableSearch?: boolean
  }) {
    const client = this.createClient()
    return client.chat.completions.create({
      model: this.name,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: options?.stream ?? false,
    })
  }
}

// OpenAI 通用适配器（支持自定义 baseUrl 和模型名称，兼容任意 OpenAI 格式 API）
export class OpenAIGenericAdapter implements ModelAdapter {
  provider = 'openai-generic'
  name = 'gpt-4o'
  apiKey: string
  baseUrl = 'https://api.openai.com/v1'

  constructor(apiKey: string, baseUrl?: string, modelName?: string) {
    this.apiKey = apiKey
    if (baseUrl) this.baseUrl = baseUrl
    if (modelName) this.name = modelName
  }

  createClient() {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      dangerouslyAllowBrowser: true,
    })
  }

  async chat(messages: Array<{role: string, content: string}>, options?: {
    temperature?: number
    maxTokens?: number
    stream?: boolean
    reasoning?: boolean
    enableSearch?: boolean
  }) {
    const client = this.createClient()
    return client.chat.completions.create({
      model: this.name,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: options?.stream ?? false,
    })
  }
}

// 获取适配器工厂
export function getAdapter(provider: string, apiKey?: string, baseUrl?: string, modelName?: string): ModelAdapter {
  switch (provider) {
    case 'deepseek':
      return new DeepSeekAdapter(apiKey || process.env.DEEPSEEK_API_KEY || '', baseUrl)
    case 'openai':
      return new OpenAIAdapter(apiKey || process.env.OPENAI_API_KEY || '', baseUrl)
    case 'openai-generic':
      return new OpenAIGenericAdapter(apiKey || '', baseUrl, modelName)
    case 'anthropic':
      return new AnthropicAdapter(apiKey || process.env.ANTHROPIC_API_KEY || '', baseUrl)
    case 'grok':
      return new GrokAdapter(apiKey || process.env.GROK_API_KEY || '', baseUrl, modelName)
    case 'ollama':
      return new OllamaAdapter(baseUrl || 'http://localhost:11434')
    default:
      return new DeepSeekAdapter(apiKey || '', baseUrl)
  }
}

// 支持的模型列表
export const SUPPORTED_MODELS = {
  deepseek: [
    { id: 'DeepSeek-V4-Flash', name: 'DeepSeek-V4-Flash', description: '通用对话 · 1M上下文' },
    { id: 'DeepSeek-V4-Pro', name: 'DeepSeek-V4-Pro', description: '增强推理 · 1M上下文' },
  ],
  openai: [
    { id: 'gpt-4.1', name: 'GPT-4.1', description: '最新旗舰' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: '轻量高效' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', description: '极速轻量' },
    { id: 'gpt-4o', name: 'GPT-4o', description: '多模态旗舰' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '经济多模态' },
  ],
  'openai-generic': [
    { id: '__custom__', name: '自定义模型', description: '手动输入模型名称和Base URL' },
  ],
  grok: [
    { id: 'grok-4.3', name: 'Grok 4.3', description: '最新旗舰' },
    { id: 'grok-4.20-0309-reasoning', name: 'Grok 4.20 Reasoning', description: '推理模式' },
    { id: 'grok-4.20-0309-non-reasoning', name: 'Grok 4.20', description: '非推理模式' },
    { id: 'grok-4.20-multi-agent-0309', name: 'Grok 4.20 Multi-Agent', description: '多智能体' },
    { id: 'grok-4-1-fast-reasoning', name: 'Grok 4.1 Fast Reasoning', description: '快速推理' },
    { id: 'grok-4-1-fast-non-reasoning', name: 'Grok 4.1 Fast', description: '快速非推理' },
    { id: 'grok-imagine-image-pro', name: 'Grok Image Pro', description: '图片Pro' },
    { id: 'grok-imagine-image', name: 'Grok Image', description: '图片生成' },
    { id: 'grok-imagine-video', name: 'Grok Video', description: '视频生成' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: '最新Sonnet' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: '最强旗舰' },
    { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', description: '成熟稳定' },
    { id: 'claude-3-opus', name: 'Claude 3 Opus', description: '经典旗舰' },
  ],
  ollama: [
    { id: 'llama3.3', name: 'Llama 3.3', description: 'Meta最新开源' },
    { id: 'qwen2.5', name: 'Qwen 2.5', description: '阿里通义千问' },
    { id: 'deepseek-r1', name: 'DeepSeek R1', description: '深度求索推理' },
    { id: 'gemma3', name: 'Gemma 3', description: 'Google轻量' },
    { id: 'mistral', name: 'Mistral', description: 'Mistral AI' },
  ]
}
