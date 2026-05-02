'use client'

import { useChatStore, type ModelConfig, type TTSConfig } from '@/stores/chat-store'
import { SUPPORTED_MODELS } from '@/lib/models/adapters'
import { X, Volume2, VolumeX, Image, User, Palette } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

export default function SettingsPanel() {
  const {
    isSettingsOpen,
    setSettingsOpen,
    modelConfigs,
    setModelConfigs,
    ttsConfig,
    updateTTSConfig,
    profileConfig,
    updateProfileConfig,
  } = useChatStore()

  const [activeTab, setActiveTab] = useState<'model' | 'tts' | 'profile' | 'about'>('model')

  return (
    <>
      {/* 半透明遮罩 */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300",
          isSettingsOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSettingsOpen(false)}
      />

      {/* 右侧滑出面板 */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-card border-l border-border shadow-2xl flex flex-col transition-transform duration-300 ease-in-out",
          isSettingsOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">设置</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-border shrink-0">
          <button onClick={() => setActiveTab('model')} className={cn("px-4 py-2 text-sm font-medium rounded-t-lg transition-colors", activeTab === 'model' ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground")}>模型配置</button>
          <button onClick={() => setActiveTab('tts')} className={cn("px-4 py-2 text-sm font-medium rounded-t-lg transition-colors", activeTab === 'tts' ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground")}>语音合成</button>
          <button onClick={() => setActiveTab('profile')} className={cn("px-4 py-2 text-sm font-medium rounded-t-lg transition-colors", activeTab === 'profile' ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground")}>用户画像</button>
          <button onClick={() => setActiveTab('about')} className={cn("px-4 py-2 text-sm font-medium rounded-t-lg transition-colors", activeTab === 'about' ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground")}>关于</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'model' && <ModelSettings />}
          {activeTab === 'tts' && <TTSSettings />}
          {activeTab === 'profile' && <ProfileSettings />}
          {activeTab === 'about' && <AboutSection />}
        </div>
      </div>
    </>
  )
}

function ModelSettings() {
  const { modelConfigs, setModelConfigs } = useChatStore()

  const addModel = async (provider: string, modelId: string) => {
    const models = SUPPORTED_MODELS[provider as keyof typeof SUPPORTED_MODELS]
    const modelEntry = models?.find(m => m.id === modelId)

    const newConfig: ModelConfig = {
      id: provider + '-' + modelId,
      provider,
      name: modelId,
      apiKey: '',
      baseUrl: getDefaultBaseUrl(provider),
      enabled: true,
      isDefault: modelConfigs.length === 0,
    }

    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      })
      const saved = await res.json()
      setModelConfigs([...modelConfigs, saved])
    } catch (error) {
      console.error('Failed to add model:', error)
    }
  }

  const getDefaultBaseUrl = (provider: string) => {
    switch (provider) {
      case 'deepseek': return 'https://api.deepseek.com'
      case 'openai': return 'https://api.openai.com/v1'
      case 'grok': return 'https://api.x.ai/v1'
      case 'anthropic': return 'https://api.anthropic.com/v1'
      case 'ollama': return 'http://localhost:11434'
      default: return ''
    }
  }

  const updateModel = async (id: string, updates: Partial<ModelConfig>) => {
    const updated = modelConfigs.map(m => m.id === id ? { ...m, ...updates } : m)
    setModelConfigs(updated)
    try {
      await fetch('/api/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
    } catch (error) {
      console.error('Failed to update model:', error)
    }
  }

  const removeModel = async (id: string) => {
    const updated = modelConfigs.filter(m => m.id !== id)
    setModelConfigs(updated)
    try {
      await fetch(`/api/models?id=${id}`, { method: 'DELETE' })
    } catch (error) {
      console.error('Failed to remove model:', error)
    }
  }

  // 获取某个提供商可用模型列表
  const getModelsForProvider = (provider: string) => {
    return SUPPORTED_MODELS[provider as keyof typeof SUPPORTED_MODELS] || []
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground mb-4">
        配置 AI 模型的 API Key 和接入参数。支持 DeepSeek、OpenAI、Grok、Anthropic Claude 和 Ollama 本地模型。
      </p>

      {modelConfigs.map(config => {
        const availableModels = getModelsForProvider(config.provider)
        return (
        <div key={config.id} className="p-4 border border-border rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{providerLabel(config.provider)}</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full", config.enabled ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground")}>
                {config.enabled ? '已启用' : '已禁用'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateModel(config.id, { enabled: !config.enabled })} className="text-xs px-2 py-1 rounded hover:bg-secondary transition-colors">
                {config.enabled ? '禁用' : '启用'}
              </button>
              <button onClick={() => removeModel(config.id)} className="text-xs px-2 py-1 rounded text-destructive hover:bg-destructive/10 transition-colors">
                删除
              </button>
            </div>
          </div>

          {config.provider !== 'ollama' && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">API Key</label>
              <input
                type="password"
                value={config.apiKey || ''}
                onChange={e => updateModel(config.id, { apiKey: e.target.value })}
                placeholder="输入 API Key"
                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground block mb-1">模型版本</label>
            {config.provider === 'openai-generic' ? (
              <input
                type="text"
                value={config.name}
                onChange={e => updateModel(config.id, { name: e.target.value })}
                placeholder="输入模型 ID（例如: qwen-plus, glm-4）"
                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            ) : availableModels.length > 0 ? (
              <select
                value={config.name}
                onChange={e => updateModel(config.id, { name: e.target.value })}
                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {availableModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name} — {m.description}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={config.name}
                onChange={e => updateModel(config.id, { name: e.target.value })}
                placeholder="输入模型 ID"
                className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Base URL</label>
            <input
              type="text"
              value={config.baseUrl || ''}
              onChange={e => updateModel(config.id, { baseUrl: e.target.value })}
              placeholder="API 地址（可选，留空使用默认）"
              className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.isDefault}
              onChange={e => updateModel(config.id, { isDefault: e.target.checked })}
              className="rounded border-border"
            />
            <span className="text-xs text-muted-foreground">设为默认模型</span>
          </div>
        </div>
      )})}

      {/* 添加新模型 */}
      <div className="pt-2">
        <p className="text-xs text-muted-foreground mb-2">添加模型：</p>
        <div className="flex flex-wrap gap-2">
          {Object.keys(SUPPORTED_MODELS).map(provider => {
            const models = getModelsForProvider(provider)
            return (
              <div key={provider} className="relative">
                <select
                  defaultValue=""
                  onChange={e => {
                    if (e.target.value) {
                      addModel(provider, e.target.value)
                      e.target.value = ''
                    }
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background hover:bg-secondary transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">+ {providerLabel(provider)}</option>
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function providerLabel(provider: string): string {
  switch (provider) {
    case 'deepseek': return 'DeepSeek'
    case 'openai': return 'OpenAI'
    case 'openai-generic': return 'OpenAI 通用'
    case 'grok': return 'Grok (xAI)'
    case 'anthropic': return 'Anthropic'
    case 'ollama': return 'Ollama'
    default: return provider
  }
}

function TTSSettings() {
  const { ttsConfig, updateTTSConfig } = useChatStore()

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground mb-4">
        配置语音合成（TTS）功能，支持百度语音和阿里云语音合成。
      </p>

      {/* 启用开关 */}
      <div className="flex items-center justify-between p-4 border border-border rounded-lg">
        <div className="flex items-center gap-3">
          {ttsConfig.enabled ? <Volume2 className="w-5 h-5 text-primary" /> : <VolumeX className="w-5 h-5 text-muted-foreground" />}
          <div>
            <div className="text-sm font-medium">语音合成</div>
            <div className="text-xs text-muted-foreground">AI 回复完成后自动播放语音</div>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={ttsConfig.enabled} onChange={e => updateTTSConfig({ enabled: e.target.checked })} className="sr-only peer" />
          <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
        </label>
      </div>

      {ttsConfig.enabled && (
        <>
          {/* 自动播放开关 */}
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-sm">自动播放</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={ttsConfig.autoPlay} onChange={e => updateTTSConfig({ autoPlay: e.target.checked })} className="sr-only peer" />
              <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          {/* 60字分句说明 */}
          <div className="px-4 py-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">
              百度 API 限制单次合成最多 60 个中文字符。
              启用后，AI 回复将自动按句拆分（每段 ≤60 字），逐段合成语音并顺序播放。
              （）内的动作/心理/环境描写不会朗读。
              启用语音播放时此功能强制开启。
            </p>
          </div>

          {/* 提供商选择 */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground block mb-2">语音提供商</label>
            <div className="flex gap-2">
              <button onClick={() => updateTTSConfig({ provider: 'baidu' })} className={cn("px-4 py-2 text-sm rounded-lg border transition-colors", ttsConfig.provider === 'baidu' ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary")}>
                百度语音
              </button>
              <button onClick={() => updateTTSConfig({ provider: 'aliyun' })} className={cn("px-4 py-2 text-sm rounded-lg border transition-colors", ttsConfig.provider === 'aliyun' ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary")}>
                阿里云语音
              </button>
            </div>
          </div>

          {ttsConfig.provider === 'baidu' ? <BaiduTTSConfig /> : <AliyunTTSConfig />}
        </>
      )}
    </div>
  )
}

function BaiduTTSConfig() {
  const { ttsConfig, updateTTSConfig } = useChatStore()

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        请在 <a href="https://console.bce.baidu.com/ai-engine/speech/overview/index" target="_blank" className="text-primary underline">百度智能云控制台</a> 创建应用获取凭证。
      </p>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">APP ID</label>
        <input type="text" value={ttsConfig.appId} onChange={e => updateTTSConfig({ appId: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">API Key</label>
        <input type="text" value={ttsConfig.apiKey} onChange={e => updateTTSConfig({ apiKey: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Secret Key</label>
        <input type="text" value={ttsConfig.secretKey} onChange={e => updateTTSConfig({ secretKey: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">发音人</label>
        <select value={ttsConfig.voice} onChange={e => updateTTSConfig({ voice: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="0">度小美（默认女声）</option>
          <option value="1">度小宇（男声）</option>
          <option value="3">度逍遥（基础男声）</option>
          <option value="4">度丫丫（童声）</option>
          <option value="5003">度逍遥（精品）</option>
          <option value="5118">度小鹿（精品）</option>
          <option value="5">度博文（男声）</option>
          <option value="103">度米朵（女声）</option>
          <option value="106">度博文（情感男声）</option>
          <option value="110">度小童（童声）</option>
          <option value="111">度小萌（童声）</option>
          <option value="4100">度小佳（女声）</option>
          <option value="4105">度小莉（女声）</option>
          <option value="4115">度小贤（男声）</option>
          <option value="4149">度小倩（女声）</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">语速 ({ttsConfig.speed})</label>
        <input type="range" min="0" max="15" value={ttsConfig.speed} onChange={e => updateTTSConfig({ speed: parseInt(e.target.value) })} className="w-full" />
        <div className="flex justify-between text-xs text-muted-foreground"><span>慢</span><span>5(默认)</span><span>快</span></div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">音调 ({ttsConfig.pitch})</label>
        <input type="range" min="0" max="15" value={ttsConfig.pitch} onChange={e => updateTTSConfig({ pitch: parseInt(e.target.value) })} className="w-full" />
        <div className="flex justify-between text-xs text-muted-foreground"><span>低</span><span>5(默认)</span><span>高</span></div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">音量 ({ttsConfig.volume})</label>
        <input type="range" min="0" max="15" value={ttsConfig.volume} onChange={e => updateTTSConfig({ volume: parseInt(e.target.value) })} className="w-full" />
        <div className="flex justify-between text-xs text-muted-foreground"><span>小</span><span>5(默认)</span><span>大</span></div>
      </div>
    </div>
  )
}

function AliyunTTSConfig() {
  const { ttsConfig, updateTTSConfig } = useChatStore()

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        请在 <a href="https://nls-portal.console.aliyun.com/applist" target="_blank" className="text-primary underline">阿里云智能语音交互控制台</a> 创建项目获取 Appkey。
        AccessKey 在 <a href="https://ram.console.aliyun.com/manage/ak" target="_blank" className="text-primary underline">RAM 控制台</a> 获取。
        也可通过环境变量 <code>ALIYUN_ACCESS_KEY_ID</code> / <code>ALIYUN_ACCESS_KEY_SECRET</code> 配置（UI 输入优先）。
      </p>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Appkey</label>
        <input type="text" value={ttsConfig.aliyunAppkey} onChange={e => updateTTSConfig({ aliyunAppkey: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">AccessKey ID</label>
        <input type="text" value={ttsConfig.aliyunAccessKeyId} onChange={e => updateTTSConfig({ aliyunAccessKeyId: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">AccessKey Secret</label>
        <input type="password" value={ttsConfig.aliyunAccessKeySecret} onChange={e => updateTTSConfig({ aliyunAccessKeySecret: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">发音人</label>
        <select value={ttsConfig.aliyunVoice} onChange={e => updateTTSConfig({ aliyunVoice: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">请选择发音人</option>
          <optgroup label="Lite 版（免费）">
            <option value="siqi">siqi（思琪·温柔女声）</option>
            <option value="sijia">sijia（思佳·标准女声）</option>
            <option value="sicheng">sicheng（思成·标准男声）</option>
            <option value="sitong">sitong（思彤·温柔女声）</option>
            <option value="aiwei">aiwei（艾薇·温柔女声）</option>
            <option value="siyue">siyue（思悦·温柔女声）</option>
            <option value="aiqi">aiqi（艾琪·甜美女声）</option>
            <option value="sijing">sijing（思婧·严厉女声）</option>
            <option value="abin">abin（阿斌·广东普通话）</option>
            <option value="ashu">ashu（阿述·广东话男声）</option>
            <option value="stanley">stanley（Stanley·沉稳男声）</option>
            <option value="kenny">kenny（Kenny·沉稳男声）</option>
            <option value="rosa">rosa（Rosa·自然女声）</option>
          </optgroup>
          <optgroup label="数字人/直播">
            <option value="zhigui">zhigui（知柜·直播数字人）</option>
            <option value="maoxiaomei">maoxiaomei（猫小妹·直播）</option>
            <option value="yunqi">yunqi（云琪·直播）</option>
            <option value="yunhao">yunhao（云浩·直播）</option>
            <option value="laotie">laotie（老铁·东北老铁）</option>
            <option value="laomei">laomei（老妹·吆喝女声）</option>
            <option value="zhimao">zhimao（知猫·普通话女声）</option>
          </optgroup>
          <optgroup label="童声">
            <option value="aitong">aitong（艾彤·儿童音）</option>
            <option value="yunxiao">yunxiao（云晓·儿童音）</option>
            <option value="jielidou">jielidou（杰力豆·治愈童声）</option>
            <option value="mashu">mashu（马树·儿童剧男声）</option>
            <option value="yuer">yuer（悦儿·儿童剧女声）</option>
          </optgroup>
          <optgroup label="方言">
            <option value="kelly">kelly（Kelly·香港粤语女声）</option>
            <option value="chuangirl">chuangirl（小玥·四川话女声）</option>
            <option value="qingqing">qingqing（青青·台湾话女声）</option>
            <option value="cuijie">cuijie（翠姐·东北话女声）</option>
            <option value="laosheng">laosheng（老剩·东北话男声）</option>
            <option value="dahu">dahu（大虎·东北话男声）</option>
            <option value="aikan">aikan（艾刊·天津话男声）</option>
            <option value="zhiqing">zhiqing（知青·台湾话女声）</option>
          </optgroup>
          <optgroup label="海外">
            <option value="lydia">lydia（Lydia·英中双语女声）</option>
            <option value="xiaoyun">xiaoyun（晓云·标准女声）</option>
            <option value="ruoxi">ruoxi（若兮·温柔女声）</option>
          </optgroup>
          <optgroup label="多语种">
            <option value="indah">indah（印尼语女声）</option>
            <option value="farah">farah（马来语女声）</option>
            <option value="tien">tien（越南语女声）</option>
          </optgroup>
          <optgroup label="多情感">
            <option value="zhifeng_emo">zhifeng_emo（知锋·多情感男声）</option>
            <option value="zhibing_emo">zhibing_emo（知冰·多情感男声）</option>
            <option value="zhimiao_emo">zhimiao_emo（知妙·多情感女声）</option>
            <option value="zhimi_emo">zhimi_emo（知米·多情感女声）</option>
            <option value="zhiyan_emo">zhiyan_emo（知燕·多情感女声）</option>
            <option value="zhibei_emo">zhibei_emo（知贝·多情感童声）</option>
            <option value="zhitian_emo">zhitian_emo（知甜·多情感女声）</option>
          </optgroup>
          <optgroup label="精品版·文学">
            <option value="zhiyuan">zhiyuan（知媛·普通话女声）</option>
            <option value="zhiya">zhiya（知雅·普通话女声·客服）</option>
            <option value="zhiyue">zhiyue（知悦·普通话女声）</option>
            <option value="zhida">zhida（知达·普通话男声）</option>
            <option value="zhistella">zhistella（知莎·普通话女声）</option>
          </optgroup>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">采样率</label>
        <select value={ttsConfig.aliyunSampleRate} onChange={e => updateTTSConfig({ aliyunSampleRate: parseInt(e.target.value) })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="8000">8000 Hz</option>
          <option value="16000">16000 Hz</option>
          <option value="22050">22050 Hz</option>
          <option value="32000">32000 Hz</option>
          <option value="44100">44100 Hz</option>
          <option value="48000">48000 Hz</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">语速 ({ttsConfig.aliyunSpeechRate})</label>
        <input type="range" min="-500" max="500" value={ttsConfig.aliyunSpeechRate} onChange={e => updateTTSConfig({ aliyunSpeechRate: parseInt(e.target.value) })} className="w-full" />
        <div className="flex justify-between text-xs text-muted-foreground"><span>慢(-500)</span><span>0(默认)</span><span>快(+500)</span></div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">语调 ({ttsConfig.aliyunPitchRate})</label>
        <input type="range" min="-500" max="500" value={ttsConfig.aliyunPitchRate} onChange={e => updateTTSConfig({ aliyunPitchRate: parseInt(e.target.value) })} className="w-full" />
        <div className="flex justify-between text-xs text-muted-foreground"><span>低(-500)</span><span>0(默认)</span><span>高(+500)</span></div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">音量 ({ttsConfig.aliyunVolume})</label>
        <input type="range" min="0" max="100" value={ttsConfig.aliyunVolume} onChange={e => updateTTSConfig({ aliyunVolume: parseInt(e.target.value) })} className="w-full" />
        <div className="flex justify-between text-xs text-muted-foreground"><span>小(0)</span><span>50(默认)</span><span>大(100)</span></div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">音频格式</label>
        <select value={ttsConfig.aliyunFormat} onChange={e => updateTTSConfig({ aliyunFormat: e.target.value as any })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="mp3">MP3</option>
          <option value="wav">WAV</option>
          <option value="pcm">PCM</option>
        </select>
      </div>
    </div>
  )
}

function ProfileSettings() {
  const { profileConfig, updateProfileConfig } = useChatStore()

  const exportProfile = async () => {
    try {
      const res = await fetch('/api/profile')
      const data = await res.json()
      const blob = new Blob([data.content], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'user-profile.md'
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export profile:', error)
    }
  }

  const importProfile = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.json'
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0]
      if (!file) return
      const content = await file.text()
      try {
        await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
        alert('画像已导入，重启对话后生效')
      } catch (error) {
        console.error('Failed to import profile:', error)
      }
    }
    input.click()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground mb-4">
        用户画像功能会分析日常对话，生成用户画像注入给 AI，帮助 AI 更好地理解您的偏好和习惯。
      </p>

      {/* 启用开关 */}
      <div className="flex items-center justify-between p-4 border border-border rounded-lg">
        <div className="flex items-center gap-3">
          <User className="w-5 h-5 text-primary" />
          <div>
            <div className="text-sm font-medium">用户画像</div>
            <div className="text-xs text-muted-foreground">分析日常对话，生成用户画像注入给 AI</div>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={profileConfig.enabled} onChange={e => updateProfileConfig({ enabled: e.target.checked })} className="sr-only peer" />
          <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
        </label>
      </div>

      {profileConfig.enabled && (
        <>
          <div>
            <label className="text-xs text-muted-foreground block mb-2">更新频率</label>
            <div className="flex gap-2">
              <button onClick={() => updateProfileConfig({ scheduleType: 'fixed' })} className={cn("px-4 py-2 text-sm rounded-lg border transition-colors", profileConfig.scheduleType === 'fixed' ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary")}>
                固定时间
              </button>
              <button onClick={() => updateProfileConfig({ scheduleType: 'interval' })} className={cn("px-4 py-2 text-sm rounded-lg border transition-colors", profileConfig.scheduleType === 'interval' ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary")}>
                间隔模式
              </button>
            </div>
          </div>

          {profileConfig.scheduleType === 'fixed' ? (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">更新时间</label>
              <input type="time" value={profileConfig.fixedTime} onChange={e => updateProfileConfig({ fixedTime: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground block mb-1">间隔值</label>
                <input type="number" min="1" value={profileConfig.intervalValue} onChange={e => updateProfileConfig({ intervalValue: parseInt(e.target.value) || 1 })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground block mb-1">单位</label>
                <select value={profileConfig.intervalUnit} onChange={e => updateProfileConfig({ intervalUnit: e.target.value as any })} className="w-full px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="minutes">分钟</option>
                  <option value="hours">小时</option>
                </select>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={exportProfile} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-secondary transition-colors">导出画像</button>
            <button onClick={importProfile} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-secondary transition-colors">导入画像</button>
          </div>
        </>
      )}
    </div>
  )
}

function AboutSection() {
  const { modelConfigs, setModelConfigs, updateTTSConfig } = useChatStore()
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('system')

  useEffect(() => {
    const stored = localStorage.getItem('charweaver-theme') || 'system'
    setThemeMode(stored as any)
  }, [])

  const changeTheme = (mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode)
    localStorage.setItem('charweaver-theme', mode)
    const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }

  return (
    <section className="space-y-6">
      {/* 主题设置 */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Palette className="w-4 h-4" />
          主题
        </h3>
        <div className="flex gap-2">
          <button onClick={() => changeTheme('light')} className={cn("px-4 py-2 text-sm rounded-lg border transition-colors", themeMode === 'light' ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary")}>浅色</button>
          <button onClick={() => changeTheme('dark')} className={cn("px-4 py-2 text-sm rounded-lg border transition-colors", themeMode === 'dark' ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary")}>深色</button>
          <button onClick={() => changeTheme('system')} className={cn("px-4 py-2 text-sm rounded-lg border transition-colors", themeMode === 'system' ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary")}>跟随系统</button>
        </div>
      </div>

      {/* 关于信息 */}
      <div className="p-4 border border-border rounded-lg space-y-2">
        <div className="text-sm font-medium">CharWeaver</div>
        <p className="text-sm text-muted-foreground">v1.0.0</p>
        <p className="text-sm text-muted-foreground">支持多角色、多模型、多会话的 AI 助手应用</p>
        <p className="text-xs text-muted-foreground">内置 DeepSeek / OpenAI / Grok / Anthropic / Ollama API 支持</p>
        <div className="pt-2 text-xs text-muted-foreground/60">
          <p>支持百度语音合成 & 阿里云语音合成 (TTS)</p>
        </div>
      </div>
    </section>
  )
}
