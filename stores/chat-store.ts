import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  metadata?: string  // JSON: { attachments?, reasoning?, webSearch? }
  createdAt: string
}

export type TTSProvider = 'baidu' | 'aliyun'

export type ProfileScheduleType = 'fixed' | 'interval'

export interface ProfileConfig {
  enabled: boolean
  scheduleType: ProfileScheduleType  // 'fixed' 固定时间 | 'interval' 间隔
  fixedTime: string                  // 固定时间 e.g. "02:00"
  intervalValue: number              // 间隔数值
  intervalUnit: 'minutes' | 'hours'  // 间隔单位
}

export interface TTSConfig {
  enabled: boolean
  autoPlay: boolean
  splitEnabled: boolean   // 60字分段（TTS启用时强制true）
  provider: TTSProvider   // 语音提供商

  // 百度
  appId: string
  apiKey: string
  secretKey: string
  voice: string           // per: 发音人
  speed: number           // spd: 语速 0-15
  pitch: number           // pit: 音调 0-15
  volume: number          // vol: 音量 0-15

  // 阿里云
  aliyunAppkey: string
  aliyunAccessKeyId: string
  aliyunAccessKeySecret: string
  aliyunVoice: string     // 发音人 ID
  aliyunSpeechRate: number // 语速 -500~500
  aliyunPitchRate: number  // 语调 -500~500
  aliyunVolume: number     // 音量 0~100
  aliyunFormat: 'pcm' | 'wav' | 'mp3'
  aliyunSampleRate: number // 采样率
}

export interface Chat {
  id: string
  title: string
  agentId: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

export interface Agent {
  id: string
  name: string
  description?: string
  avatar?: string
  avatarColor: string
  greeting?: string
  personality?: string
  background?: string
  mentalModels?: string
  heuristics?: string
  expressionDNA?: string
  values?: string
  antiPatterns?: string
  tensions?: string
  knowledgeBoundary?: string
  systemPrompt: string
  temperature: number
  maxTokens: number
  model: string
  isDefault: boolean
}

export interface ModelConfig {
  id: string
  provider: string
  name: string
  apiKey?: string
  baseUrl: string
  enabled: boolean
  isDefault: boolean
}

interface ChatStore {
  // Agents
  agents: Agent[]
  currentAgent: Agent | null
  setAgents: (agents: Agent[]) => void
  setCurrentAgent: (agent: Agent | null) => void

  // Chats
  chats: Chat[]
  currentChat: Chat | null
  setChats: (chats: Chat[]) => void
  setCurrentChat: (chat: Chat | null) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, content: string) => void
  clearCurrentChat: () => void

  // Model configs
  modelConfigs: ModelConfig[]
  currentModel: string
  setModelConfigs: (configs: ModelConfig[]) => void
  setCurrentModel: (model: string) => void

  // UI state
  isSettingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  isCreatingAgent: boolean
  setCreatingAgent: (creating: boolean) => void
  editingAgent: Agent | null
  setEditingAgent: (agent: Agent | null) => void

  // TTS
  ttsConfig: TTSConfig
  updateTTSConfig: (config: Partial<TTSConfig>) => void

  // 用户画像
  profileConfig: ProfileConfig
  updateProfileConfig: (config: Partial<ProfileConfig>) => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      // Agents
      agents: [],
      currentAgent: null,
      setAgents: (agents) => set({ agents }),
      setCurrentAgent: (currentAgent) => set({ currentAgent }),

      // Chats
      chats: [],
      currentChat: null,
      setChats: (chats) => set({ chats }),
      setCurrentChat: (currentChat) => set({ currentChat }),
      addMessage: (message) => set((state) => {
        if (!state.currentChat) return state
        return {
          currentChat: {
            ...state.currentChat,
            messages: [...state.currentChat.messages, message]
          }
        }
      }),
      updateMessage: (id, content) => set((state) => {
        if (!state.currentChat) return state
        return {
          currentChat: {
            ...state.currentChat,
            messages: state.currentChat.messages.map(m =>
              m.id === id ? { ...m, content } : m
            )
          }
        }
      }),
      clearCurrentChat: () => set((state) => {
        if (!state.currentChat) return state
        return {
          currentChat: {
            ...state.currentChat,
            messages: []
          }
        }
      }),

      // Model configs
      modelConfigs: [],
      currentModel: 'DeepSeek-V4-Flash',
      setModelConfigs: (modelConfigs) => set({ modelConfigs }),
      setCurrentModel: (currentModel) => set({ currentModel }),

      // UI state
      isSettingsOpen: false,
      setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
      isCreatingAgent: false,
      setCreatingAgent: (isCreatingAgent) => set({ isCreatingAgent }),
      editingAgent: null,
      setEditingAgent: (editingAgent) => set({ editingAgent }),

      // TTS
      ttsConfig: {
        enabled: false,
        autoPlay: false,
        splitEnabled: true,
        provider: 'baidu',
        appId: '117474688',
        apiKey: '1iJqyYnkMjnR7eGJXGXJubAm',
        secretKey: 'fPI1ftTN1UPPd8dCMogk58zwUWLGri9C',
        voice: '0',
        speed: 5,
        pitch: 5,
        volume: 5,
        aliyunAppkey: '',
        aliyunAccessKeyId: '',
        aliyunAccessKeySecret: '',
        aliyunVoice: 'xiaoyun',
        aliyunSpeechRate: 0,
        aliyunPitchRate: 0,
        aliyunVolume: 50,
        aliyunFormat: 'mp3',
        aliyunSampleRate: 16000,
      },
      updateTTSConfig: (config) => set((state) => ({
        ttsConfig: { ...state.ttsConfig, ...config }
      })),

      // 用户画像
      profileConfig: {
        enabled: true,
        scheduleType: 'fixed',
        fixedTime: '02:00',
        intervalValue: 6,
        intervalUnit: 'hours',
      },
      updateProfileConfig: (config) => set((state) => ({
        profileConfig: { ...state.profileConfig, ...config }
      })),
    }),
    {
      name: 'agent-web-store',
      partialize: (state) => ({
        ttsConfig: state.ttsConfig,
        profileConfig: state.profileConfig,
      }),
      merge: (persisted, current) => ({
        ...current,
        ttsConfig: { ...current.ttsConfig, ...(persisted as any).ttsConfig },
        profileConfig: { ...current.profileConfig, ...(persisted as any).profileConfig },
      }),
    }
  )
)
