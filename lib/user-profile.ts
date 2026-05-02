/**
 * 用户画像工具模块
 * - 读取/写入 .memory/USER_PROFILE.md
 * - 读取/写入 .memory/PROFILE_CONFIG.json
 * - 生成格式化的 system prompt 文本
 */
import fs from 'fs'
import path from 'path'

// .memory 目录位于 charweaver 项目目录内
const MEMORY_DIR = path.join(process.cwd(), '.memory')
const PROFILE_FILE = path.join(MEMORY_DIR, 'USER_PROFILE.md')
const CONFIG_FILE = path.join(MEMORY_DIR, 'PROFILE_CONFIG.json')

export interface ProfileConfig {
  enabled: boolean
  scheduleType: 'fixed' | 'interval'
  fixedTime: string
  intervalValue: number
  intervalUnit: 'minutes' | 'hours'
}

const DEFAULT_CONFIG: ProfileConfig = {
  enabled: true,
  scheduleType: 'fixed',
  fixedTime: '02:00',
  intervalValue: 6,
  intervalUnit: 'hours',
}

/**
 * 获取用户画像文件路径
 */
export function getProfilePath(): string {
  return PROFILE_FILE
}

/**
 * 加载用户画像，返回原始 Markdown 文本
 * 如果文件不存在返回空字符串
 */
export function loadUserProfile(): string {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      return fs.readFileSync(PROFILE_FILE, 'utf-8')
    }
    return ''
  } catch {
    return ''
  }
}

/**
 * 获取格式化的用户画像系统提示词
 * 返回 null 表示没有用户画像数据或功能未启用
 */
export function getProfileSystemPrompt(): string | null {
  // 先检查是否启用
  const config = loadProfileConfig()
  if (!config.enabled) return null

  const content = loadUserProfile()
  if (!content || content.trim() === '') return null

  // 跳过没有实际数据的空模板
  const lines = content.split('\n').filter(l => l.trim())
  const hasRealData = lines.some(l => l.startsWith('- ') && l.length > 4)
  if (!hasRealData) return null

  return `## 用户画像参考

以下是对你这个用户的画像分析，请参考这些信息来更好地理解用户的背景、偏好和沟通风格：

${content}

---`
}

/**
 * 保存用户画像到文件
 */
export function saveUserProfile(content: string): void {
  try {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true })
    }
    fs.writeFileSync(PROFILE_FILE, content, 'utf-8')
  } catch (err) {
    console.error('Failed to save user profile:', err)
  }
}

/**
 * 加载用户画像配置
 */
export function loadProfileConfig(): ProfileConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_CONFIG, ...parsed }
    }
  } catch {}
  return { ...DEFAULT_CONFIG }
}

/**
 * 保存用户画像配置
 */
export function saveProfileConfig(config: Partial<ProfileConfig>): ProfileConfig {
  try {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true })
    }
    const current = loadProfileConfig()
    const merged = { ...current, ...config }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8')
    return merged
  } catch (err) {
    console.error('Failed to save profile config:', err)
    return { ...DEFAULT_CONFIG, ...config }
  }
}
