/**
 * 角色记忆工具模块
 * - 每个 agent 有自己的 .memory/agents/{agentId}/AGENT_MEMORY.md
 * - 记忆内容由 AI 自动分析对话生成（主题摘要+关键点）
 * - 注入到 system prompt 帮助 AI 了解近期对话上下文
 */
import fs from 'fs'
import path from 'path'

const MEMORY_DIR = path.join(process.cwd(), '.memory', 'agents')

export interface AgentMemoryConfig {
  enabled: boolean
  scheduleType: 'fixed' | 'interval'
  fixedTime: string
  intervalValue: number
  intervalUnit: 'minutes' | 'hours'
  lastUpdated: string | null   // ISO 8601 datetime
}

const DEFAULT_CONFIG: AgentMemoryConfig = {
  enabled: true,
  scheduleType: 'fixed',
  fixedTime: '02:00',
  intervalValue: 6,
  intervalUnit: 'hours',
  lastUpdated: null,
}

function getAgentDir(agentId: string): string {
  return path.join(MEMORY_DIR, agentId)
}

function getMemoryFile(agentId: string): string {
  return path.join(getAgentDir(agentId), 'AGENT_MEMORY.md')
}

function getConfigFile(agentId: string): string {
  return path.join(getAgentDir(agentId), 'MEMORY_CONFIG.json')
}

/**
 * 加载角色记忆内容
 */
export function loadAgentMemory(agentId: string): string {
  try {
    const file = getMemoryFile(agentId)
    if (fs.existsSync(file)) {
      return fs.readFileSync(file, 'utf-8')
    }
  } catch {}
  return ''
}

/**
 * 保存角色记忆内容
 */
export function saveAgentMemory(agentId: string, content: string): void {
  try {
    const dir = getAgentDir(agentId)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(getMemoryFile(agentId), content, 'utf-8')
  } catch (err) {
    console.error(`Failed to save agent memory for ${agentId}:`, err)
  }
}

/**
 * 加载角色记忆配置
 */
export function loadAgentMemoryConfig(agentId: string): AgentMemoryConfig {
  try {
    const file = getConfigFile(agentId)
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_CONFIG, ...parsed }
    }
  } catch {}
  return { ...DEFAULT_CONFIG }
}

/**
 * 保存角色记忆配置
 */
export function saveAgentMemoryConfig(agentId: string, config: Partial<AgentMemoryConfig>): AgentMemoryConfig {
  try {
    const dir = getAgentDir(agentId)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const current = loadAgentMemoryConfig(agentId)
    const merged = { ...current, ...config }
    fs.writeFileSync(getConfigFile(agentId), JSON.stringify(merged, null, 2), 'utf-8')
    return merged
  } catch (err) {
    console.error(`Failed to save agent memory config for ${agentId}:`, err)
    return { ...DEFAULT_CONFIG, ...config }
  }
}

/**
 * 删除角色记忆（删除 agent 时调用）
 */
export function deleteAgentMemory(agentId: string): void {
  try {
    const dir = getAgentDir(agentId)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  } catch (err) {
    console.error(`Failed to delete agent memory for ${agentId}:`, err)
  }
}

/**
 * 获取格式化的角色记忆系统提示词
 * 返回 null 表示没有记忆数据或功能未启用
 */
export function getAgentMemorySystemPrompt(agentId: string, agentName?: string): string | null {
  const config = loadAgentMemoryConfig(agentId)
  if (!config.enabled) return null

  const content = loadAgentMemory(agentId)
  if (!content || content.trim() === '') return null

  return `## 近期对话记忆（${agentName || '当前角色'}）

以下是对你和 ${agentName || '当前角色'} 近期对话的摘要，请参考这些信息以保持对话连贯性：

${content.trim()}

---`
}
