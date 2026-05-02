'use client'

import { useChatStore } from '@/stores/chat-store'
import { X, Plus, Check, Trash2, ChevronDown, ChevronRight, Lightbulb } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { parseJSON, safeStringify, generateSystemPrompt, parseSystemPrompt, type MentalModel, type Heuristic, type ExpressionDNA, type Value, type Tension, type KnowledgeBoundary } from '@/lib/prompt-generator'

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
]

type TabType = 'basic' | 'mind' | 'expression' | 'values' | 'memory' | 'preview'

interface AgentForm {
  name: string
  description: string
  avatarColor: string
  greeting: string
  personality: string
  background: string
  mentalModels: MentalModel[]
  heuristics: Heuristic[]
  expressionDNA: ExpressionDNA
  values: Value[]
  antiPatterns: string[]
  tensions: Tension[]
  knowledgeBoundary: KnowledgeBoundary
  temperature: number
  maxTokens: number
  model: string
  systemPrompt: string
}

const PRESETS = {
  name: '智慧导师',
  greeting: '你好！我是你的专属导师。有什么困惑尽管问我，我们可以一起探讨。',
  personality: '温和耐心、逻辑清晰、善于用类比解释复杂概念。遇到问题时，会先理解本质再给出建议。',
  background: '一位博学的长者，阅读广泛，经历过人生的起伏，对年轻人面临的问题有深刻的洞察。',
  mentalModels: [
    { name: '第一性原理', description: '从最基本的不可拆分的真理出发思考问题', example: '用户问"该不该考研"，先问"考研真正解决的是什么问题"' },
    { name: '逆向思维', description: '先想清楚不想要什么，再决定要什么', example: '问"5年后不想成为什么样的人"' },
  ],
  heuristics: [
    { rule: '如果答案不确定，就说"我不知道"', scenario: '用户问到我确实不了解的领域' },
    { rule: '用"你这个问题很有意思"开头', scenario: '用户提出深刻问题时' },
  ],
  expressionDNA: {
    vocabulary: ['本质上', '或许', '关键在于', '让我想想'],
    phrases: ['你的困惑很常见', '换个角度看这个问题'],
    style: '温和、耐心、喜欢用类比和故事来说明观点',
  },
  values: [
    { value: '诚实——不知道就说不知道', priority: 1 },
    { value: '实用——给可操作的建议', priority: 2 },
    { value: '启发——引导思考而非直接给答案', priority: 3 },
  ],
  antiPatterns: [
    '不要给出模糊笼统的建议',
    '不要同时支持两个相反的观点',
    '不要假装知道我不确定的事情',
  ],
  tensions: [
    { left: '追求真理', right: '照顾感受', description: '有时候真话可能伤人，但谎言更伤人' },
    { left: '给建议', right: '引导思考', description: '想知道该直接给答案还是让他自己想明白' },
  ],
  knowledgeBoundary: {
    known: ['人生决策', '学习方法', '思维框架', '人际关系'],
    unknown: ['具体技术细节', '未来预测', '专业医疗/法律建议'],
  },
}

// 模板提示
const TEMPLATE_HINTS = {
  greeting: '定义你第一次和用户打招呼时的开场白，要符合你的性格',
  personality: '用3-5个形容词描述你的性格特点，以及在对话中表现出来的方式',
  background: '描述你的背景故事：你是谁？你是怎么变成现在这样的？这让用户更容易信任你',
  mentalModels: '心智模型是你看待世界的基本框架。每个人都有自己独特的"镜片"来理解事物',
  heuristics: '快速决策规则——遇到某些场景时，你会下意识怎么反应？',
  expressionDNA: '你的说话风格：喜欢用什么词？有什么口头禅？语气是严谨还是轻松？',
  values: '按重要性排序你的核心价值观。当两个价值观冲突时，你会怎么选择？',
  antiPatterns: '列出你不应该做的事情——这让你的行为更可预测、更值得信任',
  tensions: '内在张力是让你真实的关键。没有矛盾的角色是扁平的',
  knowledgeBoundary: '清晰地定义你知道什么、不知道什么，这比假装全知更有可信度',
}

export default function AgentModal() {
  const { 
    isCreatingAgent, 
    setCreatingAgent,
    editingAgent,
    setEditingAgent,
    setAgents,
    currentAgent,
    setCurrentAgent,
    agents
  } = useChatStore()
  
  const [activeTab, setActiveTab] = useState<TabType>('basic')
  const [showHint, setShowHint] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState('')
  const [submitError, setSubmitError] = useState('')
  // 记忆相关状态
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [memoryScheduleType, setMemoryScheduleType] = useState<'fixed' | 'interval'>('fixed')
  const [memoryFixedTime, setMemoryFixedTime] = useState('02:00')
  const [memoryIntervalValue, setMemoryIntervalValue] = useState(6)
  const [memoryIntervalUnit, setMemoryIntervalUnit] = useState<'minutes' | 'hours'>('hours')
  const [memoryLastUpdated, setMemoryLastUpdated] = useState<string | null>(null)
  const [memoryContent, setMemoryContent] = useState('')
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memoryAnalyzing, setMemoryAnalyzing] = useState(false)
  const [form, setForm] = useState<AgentForm>({
    name: '',
    description: '',
    avatarColor: AVATAR_COLORS[0],
    greeting: '',
    personality: '',
    background: '',
    mentalModels: [],
    heuristics: [],
    expressionDNA: { vocabulary: [], phrases: [], style: '' },
    values: [],
    antiPatterns: [],
    tensions: [],
    knowledgeBoundary: { known: [], unknown: [] },
    temperature: 0.7,
    maxTokens: 4096,
    model: 'deepseek-chat',
    systemPrompt: '',
  })

  // 名称冲突检测：同名且不是自己
  const nameConflict = form.name.trim()
    && agents.some(a => a.name === form.name.trim() && a.id !== editingAgent?.id)
  
  const isOpen = isCreatingAgent || editingAgent !== null
  
  useEffect(() => {
    if (editingAgent) {
      setForm({
        name: editingAgent.name,
        description: editingAgent.description || '',
        avatarColor: editingAgent.avatarColor,
        greeting: editingAgent.greeting || '',
        personality: editingAgent.personality || '',
        background: editingAgent.background || '',
        mentalModels: parseJSON((editingAgent as any).mentalModels, []),
        heuristics: parseJSON((editingAgent as any).heuristics, []),
        expressionDNA: parseJSON((editingAgent as any).expressionDNA, { vocabulary: [], phrases: [], style: '' }),
        values: parseJSON((editingAgent as any).values, []),
        antiPatterns: parseJSON((editingAgent as any).antiPatterns, []),
        tensions: parseJSON((editingAgent as any).tensions, []),
        knowledgeBoundary: parseJSON((editingAgent as any).knowledgeBoundary, { known: [], unknown: [] }),
        temperature: editingAgent.temperature,
        maxTokens: editingAgent.maxTokens,
        model: editingAgent.model,
        systemPrompt: editingAgent.systemPrompt || '',
      })
      // 加载记忆配置
      loadMemoryData(editingAgent.id)
    } else {
      setForm({
        name: '',
        description: '',
        avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        greeting: '',
        personality: '',
        background: '',
        mentalModels: [],
        heuristics: [],
        expressionDNA: { vocabulary: [], phrases: [], style: '' },
        values: [],
        antiPatterns: [],
        tensions: [],
        knowledgeBoundary: { known: [], unknown: [] },
        temperature: 0.7,
        maxTokens: 4096,
        model: 'deepseek-chat',
        systemPrompt: '',
      })
      // 新建角色时重置记忆状态
      resetMemoryState()
    }
  }, [editingAgent, isCreatingAgent])
  
  // 更新预览
  useEffect(() => {
    if (form.systemPrompt) {
      setPreview(form.systemPrompt)
    } else {
      setPreview(generateSystemPrompt(form))
    }
  }, [form])
  
  const handleClose = () => {
    setCreatingAgent(false)
    setEditingAgent(null)
    setActiveTab('basic')
  }
  
  const handleApplyPreset = () => {
    setForm({
      ...PRESETS,
      avatarColor: form.avatarColor,
    })
  }
  
  // 添加心智模型
  const addMentalModel = () => {
    setForm(prev => ({
      ...prev,
      mentalModels: [...prev.mentalModels, { name: '', description: '', example: '' }]
    }))
  }
  
  const updateMentalModel = (index: number, field: string, value: string) => {
    setForm(prev => ({
      ...prev,
      mentalModels: prev.mentalModels.map((m, i) => 
        i === index ? { ...m, [field]: value } : m
      )
    }))
  }
  
  const removeMentalModel = (index: number) => {
    setForm(prev => ({
      ...prev,
      mentalModels: prev.mentalModels.filter((_, i) => i !== index)
    }))
  }
  
  // 添加启发式
  const addHeuristic = () => {
    setForm(prev => ({
      ...prev,
      heuristics: [...prev.heuristics, { rule: '', scenario: '' }]
    }))
  }
  
  const updateHeuristic = (index: number, field: string, value: string) => {
    setForm(prev => ({
      ...prev,
      heuristics: prev.heuristics.map((h, i) => 
        i === index ? { ...h, [field]: value } : h
      )
    }))
  }
  
  const removeHeuristic = (index: number) => {
    setForm(prev => ({
      ...prev,
      heuristics: prev.heuristics.filter((_, i) => i !== index)
    }))
  }
  
  // 添加价值观
  const addValue = () => {
    setForm(prev => ({
      ...prev,
      values: [...prev.values, { value: '', priority: prev.values.length + 1 }]
    }))
  }
  
  const updateValue = (index: number, field: string, value: any) => {
    setForm(prev => ({
      ...prev,
      values: prev.values.map((v, i) => 
        i === index ? { ...v, [field]: value } : v
      )
    }))
  }
  
  const removeValue = (index: number) => {
    setForm(prev => ({
      ...prev,
      values: prev.values.filter((_, i) => i !== index)
    }))
  }
  
  // 添加反模式
  const addAntiPattern = () => {
    setForm(prev => ({
      ...prev,
      antiPatterns: [...prev.antiPatterns, '']
    }))
  }
  
  const updateAntiPattern = (index: number, value: string) => {
    setForm(prev => ({
      ...prev,
      antiPatterns: prev.antiPatterns.map((a, i) => i === index ? value : a)
    }))
  }
  
  const removeAntiPattern = (index: number) => {
    setForm(prev => ({
      ...prev,
      antiPatterns: prev.antiPatterns.filter((_, i) => i !== index)
    }))
  }
  
  // 添加张力
  const addTension = () => {
    setForm(prev => ({
      ...prev,
      tensions: [...prev.tensions, { left: '', right: '', description: '' }]
    }))
  }
  
  const updateTension = (index: number, field: string, value: string) => {
    setForm(prev => ({
      ...prev,
      tensions: prev.tensions.map((t, i) => 
        i === index ? { ...t, [field]: value } : t
      )
    }))
  }
  
  const removeTension = (index: number) => {
    setForm(prev => ({
      ...prev,
      tensions: prev.tensions.filter((_, i) => i !== index)
    }))
  }
  
  // 提交
  const handleSubmit = async () => {
    if (!form.name.trim() || nameConflict) return
    
    setSubmitError('')
    
    const agentData: any = {
      name: form.name,
      description: form.description,
      avatarColor: form.avatarColor,
      greeting: form.greeting,
      personality: form.personality,
      background: form.background,
      mentalModels: safeStringify(form.mentalModels),
      heuristics: safeStringify(form.heuristics),
      expressionDNA: safeStringify(form.expressionDNA),
      values: safeStringify(form.values),
      antiPatterns: safeStringify(form.antiPatterns),
      tensions: safeStringify(form.tensions),
      knowledgeBoundary: safeStringify(form.knowledgeBoundary),
      systemPrompt: form.systemPrompt || generateSystemPrompt(form),
      temperature: form.temperature,
      maxTokens: form.maxTokens,
      model: form.model,
    }
    
    try {
      const url = editingAgent 
        ? `/api/agents/${editingAgent.id}` 
        : '/api/agents'
      const method = editingAgent ? 'PATCH' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentData)
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setSubmitError(data.error || '保存失败，请重试')
        return
      }
      
      const agent = data
      
      const agentsRes = await fetch('/api/agents')
      const agentsData = await agentsRes.json()
      setAgents(agentsData)
      
      if (!editingAgent) {
        setCurrentAgent(agent)
      } else if (currentAgent?.id === agent.id) {
        setCurrentAgent(agent)
      }
      
      handleClose()
    } catch (error: any) {
      console.error('Failed to save agent:', error)
      // 尝试从响应中提取错误信息
      if (error?.message) {
        setSubmitError(error.message)
      } else {
        setSubmitError('保存失败，请重试')
      }
    }
  }
  
  const tabs: { id: TabType; label: string }[] = [
    { id: 'basic', label: '基础设定' },
    { id: 'mind', label: '心智模型' },
    { id: 'expression', label: '表达风格' },
    { id: 'values', label: '价值观' },
    { id: 'memory', label: '角色记忆' },
    { id: 'preview', label: '预览' },
  ]
  
  const toggleHint = (key: string) => {
    setShowHint(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // === 记忆功能 ===
  const resetMemoryState = () => {
    setMemoryEnabled(true)
    setMemoryScheduleType('fixed')
    setMemoryFixedTime('02:00')
    setMemoryIntervalValue(6)
    setMemoryIntervalUnit('hours')
    setMemoryLastUpdated(null)
    setMemoryContent('')
  }

  const loadMemoryData = async (agentId: string) => {
    try {
      const [memRes, cfgRes] = await Promise.all([
        fetch(`/api/agents/${agentId}/memory`),
        fetch(`/api/agents/${agentId}/memory/config`),
      ])
      if (memRes.ok) {
        const memData = await memRes.json()
        setMemoryContent(memData.content || '')
      }
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json()
        const cfg = cfgData.config
        setMemoryEnabled(cfg.enabled ?? true)
        setMemoryScheduleType(cfg.scheduleType || 'fixed')
        setMemoryFixedTime(cfg.fixedTime || '02:00')
        setMemoryIntervalValue(cfg.intervalValue ?? 6)
        setMemoryIntervalUnit(cfg.intervalUnit || 'hours')
        setMemoryLastUpdated(cfg.lastUpdated || null)
      }
    } catch {}
  }

  const handleSaveMemoryConfig = async () => {
    if (!editingAgent) return
    try {
      await fetch(`/api/agents/${editingAgent.id}/memory/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: memoryEnabled,
          scheduleType: memoryScheduleType,
          fixedTime: memoryFixedTime,
          intervalValue: memoryIntervalValue,
          intervalUnit: memoryIntervalUnit,
        }),
      })
    } catch {}
  }

  const handleManualAnalyze = async () => {
    if (!editingAgent || memoryAnalyzing) return
    setMemoryAnalyzing(true)
    setSubmitError('')
    try {
      const res = await fetch(`/api/agents/${editingAgent.id}/memory/analyze`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        if (data.content) {
          setMemoryContent(data.content)
          setMemoryLastUpdated(new Date().toISOString())
        } else {
          setSubmitError(data.message || '分析失败：对话数据不足（需至少 2 条消息）')
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        setSubmitError(errData.error || `分析请求失败 (${res.status})`)
      }
    } catch (err) {
      setSubmitError('网络错误，请稍后重试')
      console.error('Manual analyze failed:', err)
    }
    setMemoryAnalyzing(false)
  }

  const handleSaveMemoryContent = async () => {
    if (!editingAgent) return
    try {
      await fetch(`/api/agents/${editingAgent.id}/memory`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: memoryContent }),
      })
    } catch {}
  }

  const handleExportMemory = async () => {
    if (!editingAgent) return
    try {
      const res = await fetch(`/api/agents/${editingAgent.id}/memory/export`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `agent-memory-${editingAgent.id}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  const handleImportMemory = async () => {
    if (!editingAgent) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (data.content) {
          setMemoryContent(data.content)
          await fetch(`/api/agents/${editingAgent.id}/memory/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: data.content, config: data.config }),
          })
          if (data.config) {
            if (data.config.enabled !== undefined) setMemoryEnabled(data.config.enabled)
            if (data.config.scheduleType) setMemoryScheduleType(data.config.scheduleType)
            if (data.config.fixedTime) setMemoryFixedTime(data.config.fixedTime)
            if (data.config.intervalValue) setMemoryIntervalValue(data.config.intervalValue)
            if (data.config.intervalUnit) setMemoryIntervalUnit(data.config.intervalUnit)
            if (data.config.lastUpdated) setMemoryLastUpdated(data.config.lastUpdated)
          }
        }
      } catch {}
    }
    input.click()
  }
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-background rounded-xl border border-border shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold">
            {editingAgent ? '编辑角色' : '创建角色'}
          </h2>
          <div className="flex items-center gap-2">
            {!editingAgent && (
              <button
                onClick={handleApplyPreset}
                className="px-3 py-1.5 text-sm bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
              >
                应用预设模板
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-2 hover:bg-secondary rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors relative",
                activeTab === tab.id 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 基础设定 */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              {/* 名称 */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  角色名称 <span className="text-destructive">*</span>
                </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => { setForm(prev => ({ ...prev, name: e.target.value })); setSubmitError('') }}
                    placeholder="给角色起个名字"
                    className={cn(
                      "w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50",
                      nameConflict ? "border-destructive" : "border-input"
                    )}
                  />
                  {nameConflict && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      角色名「{form.name}」已存在，请换个名称
                    </p>
                  )}
                  {submitError && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      {submitError}
                    </p>
                  )}
              </div>
              
              {/* 头像颜色 */}
              <div>
                <label className="text-sm font-medium mb-2 block">主题色</label>
                <div className="flex gap-2">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setForm(prev => ({ ...prev, avatarColor: color }))}
                      className={cn(
                        "w-8 h-8 rounded-full transition-transform",
                        form.avatarColor === color ? "ring-2 ring-primary ring-offset-2 scale-110" : ""
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              
              {/* 描述 */}
              <div>
                <label className="text-sm font-medium mb-2 block">简短描述</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="一句话介绍这个角色"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              
              {/* 开场白 */}
              <HintSection hint={TEMPLATE_HINTS.greeting}>
                <div>
                  <label className="text-sm font-medium mb-2 block">开场白</label>
                  <textarea
                    value={form.greeting}
                    onChange={(e) => setForm(prev => ({ ...prev, greeting: e.target.value }))}
                    placeholder="第一次和用户打招呼时说什么？"
                    rows={2}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  />
                </div>
              </HintSection>
              
              {/* 性格 */}
              <HintSection hint={TEMPLATE_HINTS.personality}>
                <div>
                  <label className="text-sm font-medium mb-2 block">性格特点</label>
                  <textarea
                    value={form.personality}
                    onChange={(e) => setForm(prev => ({ ...prev, personality: e.target.value }))}
                    placeholder="用几个形容词描述这个角色的性格..."
                    rows={2}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  />
                </div>
              </HintSection>
              
              {/* 背景 */}
              <HintSection hint={TEMPLATE_HINTS.background}>
                <div>
                  <label className="text-sm font-medium mb-2 block">背景故事</label>
                  <textarea
                    value={form.background}
                    onChange={(e) => setForm(prev => ({ ...prev, background: e.target.value }))}
                    placeholder="这个角色是谁？他是怎么变成现在这样的？"
                    rows={3}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  />
                </div>
              </HintSection>
              
              {/* 高级设置 */}
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                  高级参数设置
                </summary>
                <div className="mt-4 space-y-4 pl-5">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">
                      Temperature: {form.temperature.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={form.temperature}
                      onChange={(e) => setForm(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>
              </details>
            </div>
          )}
          
          {/* 心智模型 */}
          {activeTab === 'mind' && (
            <div className="space-y-6">
              <HintSection hint={TEMPLATE_HINTS.mentalModels}>
                <p className="text-sm text-muted-foreground">
                  心智模型是你看待世界的基本框架。这是你思考问题的"透镜"。
                </p>
              </HintSection>
              
              {/* 启发式 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">决策启发式</label>
                  <button
                    onClick={addHeuristic}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Plus className="w-4 h-4" /> 添加
                  </button>
                </div>
                <div className="space-y-3">
                  {form.heuristics.map((h, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={h.rule}
                          onChange={(e) => updateHeuristic(i, 'rule', e.target.value)}
                          placeholder='如果X，则Y（例如：如果用户生气，先冷静）'
                          className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <input
                          type="text"
                          value={h.scenario}
                          onChange={(e) => updateHeuristic(i, 'scenario', e.target.value)}
                          placeholder="适用场景"
                          className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                      <button
                        onClick={() => removeHeuristic(i)}
                        className="p-2 hover:bg-destructive/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  ))}
                  {form.heuristics.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      还没有添加决策启发式
                    </p>
                  )}
                </div>
              </div>
              
              {/* 心智模型 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">心智模型</label>
                  <button
                    onClick={addMentalModel}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Plus className="w-4 h-4" /> 添加
                  </button>
                </div>
                <div className="space-y-4">
                  {form.mentalModels.map((m, i) => (
                    <div key={i} className="border border-border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">模型 {i + 1}</span>
                        <button
                          onClick={() => removeMentalModel(i)}
                          className="p-1 hover:bg-destructive/10 rounded"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={m.name}
                        onChange={(e) => updateMentalModel(i, 'name', e.target.value)}
                        placeholder="模型名称（例如：第一性原理）"
                        className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <textarea
                        value={m.description}
                        onChange={(e) => updateMentalModel(i, 'description', e.target.value)}
                        placeholder="这个模型的核心内容是什么？"
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      />
                      <input
                        type="text"
                        value={m.example || ''}
                        onChange={(e) => updateMentalModel(i, 'example', e.target.value)}
                        placeholder="应用示例（可选）"
                        className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  ))}
                  {form.mentalModels.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      还没有添加心智模型
                    </p>
                  )}
                </div>
              </div>
              
              {/* 张力 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">内在张力</label>
                  <button
                    onClick={addTension}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Plus className="w-4 h-4" /> 添加
                  </button>
                </div>
                <HintSection hint={TEMPLATE_HINTS.tensions}>
                  <p className="text-sm text-muted-foreground mb-3">
                    内在张力是让角色真实的关键。没有矛盾的角色是扁平的。
                  </p>
                </HintSection>
                <div className="space-y-3">
                  {form.tensions.map((t, i) => (
                    <div key={i} className="border border-border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">矛盾 {i + 1}</span>
                        <button
                          onClick={() => removeTension(i)}
                          className="p-1 hover:bg-destructive/10 rounded"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={t.left}
                          onChange={(e) => updateTension(i, 'left', e.target.value)}
                          placeholder="矛盾A"
                          className="px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <input
                          type="text"
                          value={t.right}
                          onChange={(e) => updateTension(i, 'right', e.target.value)}
                          placeholder="矛盾B"
                          className="px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                      <textarea
                        value={t.description}
                        onChange={(e) => updateTension(i, 'description', e.target.value)}
                        placeholder="描述这个矛盾如何同时存在"
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      />
                    </div>
                  ))}
                  {form.tensions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      还没有添加内在张力
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* 表达风格 */}
          {activeTab === 'expression' && (
            <div className="space-y-6">
              <HintSection hint={TEMPLATE_HINTS.expressionDNA}>
                <p className="text-sm text-muted-foreground">
                  定义这个角色独特的说话方式。让用户一听就知道是谁在说话。
                </p>
              </HintSection>
              
              {/* 常用词汇 */}
              <div>
                <label className="text-sm font-medium mb-2 block">常用词汇</label>
                <p className="text-xs text-muted-foreground mb-2">
                  用逗号分隔，例如：本质上、关键在于、或许
                </p>
                <input
                  type="text"
                  value={form.expressionDNA.vocabulary.join('、')}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    expressionDNA: { ...prev.expressionDNA, vocabulary: e.target.value.split('、').filter(Boolean) }
                  }))}
                  placeholder="本质上、关键在于、或许"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              
              {/* 口头禅 */}
              <div>
                <label className="text-sm font-medium mb-2 block">口头禅</label>
                <p className="text-xs text-muted-foreground mb-2">
                  这个角色经常说的固定短语
                </p>
                <input
                  type="text"
                  value={form.expressionDNA.phrases.join('、')}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    expressionDNA: { ...prev.expressionDNA, phrases: e.target.value.split('、').filter(Boolean) }
                  }))}
                  placeholder="这个问题很有趣、让我想想"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              
              {/* 表达风格 */}
              <div>
                <label className="text-sm font-medium mb-2 block">表达风格</label>
                <textarea
                  value={form.expressionDNA.style}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    expressionDNA: { ...prev.expressionDNA, style: e.target.value }
                  }))}
                  placeholder="描述这个角色的说话风格：严谨还是轻松？喜欢用比喻吗？..."
                  rows={3}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
              
              {/* 知识边界 */}
              <div>
                <label className="text-sm font-medium mb-3 block">知识边界</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">这个角色擅长的领域</p>
                    <textarea
                      value={form.knowledgeBoundary.known.join('、')}
                      onChange={(e) => setForm(prev => ({
                        ...prev,
                        knowledgeBoundary: { ...prev.knowledgeBoundary, known: e.target.value.split('、').filter(Boolean) }
                      }))}
                      placeholder="人生决策、学习方法..."
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">这个角色不了解的</p>
                    <textarea
                      value={form.knowledgeBoundary.unknown.join('、')}
                      onChange={(e) => setForm(prev => ({
                        ...prev,
                        knowledgeBoundary: { ...prev.knowledgeBoundary, unknown: e.target.value.split('、').filter(Boolean) }
                      }))}
                      placeholder="具体技术细节、未来预测..."
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* 价值观 */}
          {activeTab === 'values' && (
            <div className="space-y-6">
              <HintSection hint={TEMPLATE_HINTS.values}>
                <p className="text-sm text-muted-foreground">
                  按重要性排序这个角色的核心价值观。当两个价值冲突时，这决定了优先级。
                </p>
              </HintSection>
              
              {/* 价值观列表 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">核心价值观</label>
                  <button
                    onClick={addValue}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Plus className="w-4 h-4" /> 添加
                  </button>
                </div>
                <div className="space-y-3">
                  {form.values.sort((a, b) => a.priority - b.priority).map((v, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm flex items-center justify-center font-medium">
                        {v.priority}
                      </span>
                      <input
                        type="text"
                        value={v.value}
                        onChange={(e) => {
                          const idx = form.values.findIndex(item => item.priority === v.priority)
                          updateValue(idx, 'value', e.target.value)
                        }}
                        placeholder="输入价值观描述"
                        className="flex-1 px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <button
                        onClick={() => {
                          const idx = form.values.findIndex(item => item.priority === v.priority)
                          removeValue(idx)
                        }}
                        className="p-2 hover:bg-destructive/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  ))}
                  {form.values.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      还没有添加价值观
                    </p>
                  )}
                </div>
              </div>
              
              {/* 反模式 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">反模式</label>
                  <button
                    onClick={addAntiPattern}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Plus className="w-4 h-4" /> 添加
                  </button>
                </div>
                <HintSection hint={TEMPLATE_HINTS.antiPatterns}>
                  <p className="text-sm text-muted-foreground mb-3">
                    这个角色不应该做的事。清晰的边界让角色更可预测。
                  </p>
                </HintSection>
                <div className="space-y-2">
                  {form.antiPatterns.map((a, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={a}
                        onChange={(e) => updateAntiPattern(i, e.target.value)}
                        placeholder="不应该做的事"
                        className="flex-1 px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <button
                        onClick={() => removeAntiPattern(i)}
                        className="p-2 hover:bg-destructive/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  ))}
                  {form.antiPatterns.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      还没有添加反模式
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* 角色记忆 */}
          {activeTab === 'memory' && editingAgent && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">角色记忆设置</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    AI 自动分析与该角色的对话，归纳聊过什么主题和关键点，用于保持对话连贯性
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-sm text-muted-foreground">启用</span>
                  <input
                    type="checkbox"
                    checked={memoryEnabled}
                    onChange={(e) => setMemoryEnabled(e.target.checked)}
                    className="toggle"
                  />
                </label>
              </div>

              {memoryEnabled && (
                <>
                  {/* 调度设置 */}
                  <div className="space-y-3 p-4 rounded-lg border border-border">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">自动更新</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">固定时间</span>
                        <input
                          type="radio"
                          checked={memoryScheduleType === 'fixed'}
                          onChange={() => setMemoryScheduleType('fixed')}
                          className="accent-primary"
                        />
                        <span className="text-xs text-muted-foreground ml-2">间隔</span>
                        <input
                          type="radio"
                          checked={memoryScheduleType === 'interval'}
                          onChange={() => setMemoryScheduleType('interval')}
                          className="accent-primary"
                        />
                      </div>
                    </div>

                    {memoryScheduleType === 'fixed' ? (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">每天</label>
                        <input
                          type="time"
                          value={memoryFixedTime}
                          onChange={(e) => setMemoryFixedTime(e.target.value)}
                          className="px-2 py-1 text-sm border border-input rounded-lg bg-background"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">每</label>
                        <input
                          type="number"
                          min={1}
                          value={memoryIntervalValue}
                          onChange={(e) => setMemoryIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 px-2 py-1 text-sm border border-input rounded-lg bg-background text-center"
                        />
                        <select
                          value={memoryIntervalUnit}
                          onChange={(e) => setMemoryIntervalUnit(e.target.value as 'minutes' | 'hours')}
                          className="px-2 py-1 text-sm border border-input rounded-lg bg-background"
                        >
                          <option value="minutes">分钟</option>
                          <option value="hours">小时</option>
                        </select>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSaveMemoryConfig}
                          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        >
                          保存配置
                        </button>
                        <button
                          onClick={handleManualAnalyze}
                          disabled={memoryAnalyzing}
                          className="px-3 py-1.5 text-xs bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                        >
                          {memoryAnalyzing ? '分析中...' : '立即分析'}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {submitError && (
                          <span className="text-xs text-destructive">{submitError}</span>
                        )}
                        {memoryLastUpdated && (
                          <span className="text-xs text-muted-foreground">
                            上次更新: {new Date(memoryLastUpdated).toLocaleString('zh-CN')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 记忆内容编辑 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">记忆内容</label>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleExportMemory}
                          className="px-3 py-1 text-xs bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                          导出
                        </button>
                        <button
                          onClick={handleImportMemory}
                          className="px-3 py-1 text-xs bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                          导入
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      记忆内容由 AI 自动生成，你也可以手动编辑。内容会被注入到对话上下文中。
                    </p>
                    <textarea
                      value={memoryContent}
                      onChange={(e) => setMemoryContent(e.target.value)}
                      rows={10}
                      className="w-full px-3 py-2 text-sm font-mono border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      placeholder="点击「立即分析」或等待自动更新生成记忆内容..."
                    />
                    <button
                      onClick={handleSaveMemoryContent}
                      className="mt-2 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      保存内容
                    </button>
                  </div>
                </>
              )}

              {!memoryEnabled && (
                <div className="p-4 rounded-lg border border-border text-center text-sm text-muted-foreground">
                  角色记忆已禁用。启用后将自动分析对话并生成摘要。
                </div>
              )}
            </div>
          )}
          
          {/* 预览 */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">系统提示词预览</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const parsed = parseSystemPrompt(form.systemPrompt || preview)
                      if (parsed.name) {
                        setForm(prev => ({
                          ...prev,
                          name: parsed.name || prev.name,
                          greeting: parsed.greeting ?? prev.greeting,
                          personality: parsed.personality ?? prev.personality,
                          background: parsed.background ?? prev.background,
                          mentalModels: parsed.mentalModels ?? prev.mentalModels,
                          heuristics: parsed.heuristics ?? prev.heuristics,
                          expressionDNA: parsed.expressionDNA ?? prev.expressionDNA,
                          values: parsed.values ?? prev.values,
                          antiPatterns: parsed.antiPatterns ?? prev.antiPatterns,
                          tensions: parsed.tensions ?? prev.tensions,
                          knowledgeBoundary: parsed.knowledgeBoundary ?? prev.knowledgeBoundary,
                        }))
                      }
                    }}
                    className="text-sm text-primary hover:underline"
                    title="从提示词反向解析填充各字段"
                  >
                    导入到表单
                  </button>
                  <span className="text-muted-foreground">|</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(preview)
                    }}
                    className="text-sm text-primary hover:underline"
                  >
                    复制
                  </button>
                </div>
              </div>
              <textarea
                value={form.systemPrompt || preview}
                onChange={(e) => setForm(prev => ({ ...prev, systemPrompt: e.target.value }))}
                placeholder="留空则自动生成，或手动编辑覆盖..."
                rows={20}
                className="w-full px-4 py-3 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono"
              />
              <p className="text-xs text-muted-foreground">
                留空则使用上方定义自动生成。粘贴外部 MD 格式系统提示词后，点击"导入到表单"即可解析填充各字段。
              </p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-secondary transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.name.trim() || nameConflict}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            {editingAgent ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 提示组件
function HintSection({ hint, children }: { hint: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  
  return (
    <div className="space-y-2">
      {children}
      <button
        onClick={() => setShow(!show)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Lightbulb className="w-3 h-3" />
        {show ? '收起提示' : '查看填写提示'}
      </button>
      {show && (
        <div className="text-xs text-muted-foreground bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
          💡 {hint}
        </div>
      )}
    </div>
  )
}
