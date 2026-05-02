/**
 * 系统提示词生成器
 * 将结构化的角色设定转换为AI可用的系统提示词
 */

export interface MentalModel {
  name: string
  description: string
  example?: string
}

export interface Heuristic {
  rule: string
  scenario: string
}

export interface ExpressionDNA {
  vocabulary: string[]
  phrases: string[]
  style: string
}

export interface Value {
  value: string
  priority: number
}

export interface Tension {
  left: string
  right: string
  description: string
}

export interface KnowledgeBoundary {
  known: string[]
  unknown: string[]
}

export interface AgentProfile {
  name: string
  greeting?: string
  personality?: string
  background?: string
  mentalModels?: MentalModel[]
  heuristics?: Heuristic[]
  expressionDNA?: ExpressionDNA
  values?: Value[]
  antiPatterns?: string[]
  tensions?: Tension[]
  knowledgeBoundary?: KnowledgeBoundary
}

/**
 * 生成完整的系统提示词
 */
export function generateSystemPrompt(profile: AgentProfile): string {
  const sections: string[] = []

  // 身份定义
  sections.push(`# 角色身份\n你是"${profile.name}"。`)

  // 开场白
  if (profile.greeting) {
    sections.push(`\n## 开场白\n${profile.greeting}`)
  }

  // 性格描述
  if (profile.personality) {
    sections.push(`\n## 性格特点\n${profile.personality}`)
  }

  // 背景故事
  if (profile.background) {
    sections.push(`\n## 背景故事\n${profile.background}`)
  }

  // 心智模型
  if (profile.mentalModels && profile.mentalModels.length > 0) {
    const modelsText = profile.mentalModels.map((m, i) => {
      let text = `${i + 1}. **${m.name}**：${m.description}`
      if (m.example) {
        text += `\n   - 示例：${m.example}`
      }
      return text
    }).join('\n')
    sections.push(`\n## 心智模型（你看待世界的方式）\n${modelsText}`)
  }

  // 决策启发式
  if (profile.heuristics && profile.heuristics.length > 0) {
    const heuristicsText = profile.heuristics.map((h, i) => {
      return `${i + 1}. **${h.rule}**（适用场景：${h.scenario}）`
    }).join('\n')
    sections.push(`\n## 决策启发式（快速决策规则）\n${heuristicsText}`)
  }

  // 表达DNA
  if (profile.expressionDNA) {
    const dna = profile.expressionDNA
    const parts: string[] = []
    
    if (dna.vocabulary && dna.vocabulary.length > 0) {
      parts.push(`- 常用词汇：${dna.vocabulary.join('、')}`)
    }
    if (dna.phrases && dna.phrases.length > 0) {
      parts.push(`- 口头禅：${dna.phrases.join('、')}`)
    }
    if (dna.style) {
      parts.push(`- 表达风格：${dna.style}`)
    }
    
    if (parts.length > 0) {
      sections.push(`\n## 表达DNA（你的说话方式）\n${parts.join('\n')}`)
    }
  }

  // 价值观
  if (profile.values && profile.values.length > 0) {
    const sortedValues = [...profile.values].sort((a, b) => a.priority - b.priority)
    const valuesText = sortedValues.map((v, i) => `${i + 1}. ${v.value}`).join('\n')
    sections.push(`\n## 价值观（按重要性排序）\n${valuesText}`)
  }

  // 反模式
  if (profile.antiPatterns && profile.antiPatterns.length > 0) {
    const antiText = profile.antiPatterns.map((a, i) => `${i + 1}. ${a}`).join('\n')
    sections.push(`\n## 反模式（你应该避免的行为）\n${antiText}`)
  }

  // 内在张力
  if (profile.tensions && profile.tensions.length > 0) {
    const tensionsText = profile.tensions.map((t, i) => {
      return `${i + 1}. **${t.left}** vs **${t.right}**：${t.description}`
    }).join('\n')
    sections.push(`\n## 内在张力（你的性格矛盾）\n这些看似矛盾的特点同时存在于你身上，让你更真实：\n${tensionsText}`)
  }

  // 知识边界
  if (profile.knowledgeBoundary) {
    const kb = profile.knowledgeBoundary
    const parts: string[] = []
    
    if (kb.known && kb.known.length > 0) {
      parts.push(`- 你擅长的：${kb.known.join('、')}`)
    }
    if (kb.unknown && kb.unknown.length > 0) {
      parts.push(`- 你不了解的：${kb.unknown.join('、')}`)
    }
    
    if (parts.length > 0) {
      sections.push(`\n## 知识边界\n${parts.join('\n')}`)
    }
  }

  // 结束语
  sections.push(`\n---\n请始终保持"${profile.name}"的角色身份，用第一人称"我"来回答。`)

  return sections.join('\n')
}

/**
 * 解析存储的JSON字符串
 */
export function parseJSON<T>(jsonString: string | null | undefined, defaultValue: T): T {
  if (!jsonString) return defaultValue
  try {
    return JSON.parse(jsonString) as T
  } catch {
    return defaultValue
  }
}

/**
 * 安全序列化JSON
 */
export function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj)
  } catch {
    return '[]'
  }
}

/**
 * 从 Markdown 系统提示词反解析为结构化角色设定
 * 与 generateSystemPrompt 的输出格式完全对应
 */
export function parseSystemPrompt(md: string): Partial<AgentProfile> {
  const profile: Partial<AgentProfile> = {}

  // 角色身份 → name
  const nameMatch = md.match(/你是"([^"]+)"/)
  if (nameMatch) profile.name = nameMatch[1]

  // 开场白
  const greeting = extractSection(md, '开场白')
  if (greeting) profile.greeting = greeting

  // 性格特点
  const personality = extractSection(md, '性格特点')
  if (personality) profile.personality = personality

  // 背景故事
  const background = extractSection(md, '背景故事')
  if (background) profile.background = background

  // 心智模型
  const mentalModelsSection = extractSection(md, '心智模型')
  if (mentalModelsSection) {
    profile.mentalModels = []
    const lines = mentalModelsSection.split('\n')
    for (const line of lines) {
      const mmMatch = line.match(/\d+\.\s+\*\*([^*]+)\*\*[：:]\s*(.+)/)
      if (mmMatch) {
        const item: MentalModel = { name: mmMatch[1].trim(), description: mmMatch[2].trim() }
        // 检查下一行是否有示例
        const idx = lines.indexOf(line)
        if (idx < lines.length - 1) {
          const next = lines[idx + 1].trim()
          const exMatch = next.match(/- 示例[：:]\s*(.+)/)
          if (exMatch) item.example = exMatch[1].trim()
        }
        profile.mentalModels.push(item)
      }
    }
  }

  // 决策启发式
  const heuristicsSection = extractSection(md, '决策启发式')
  if (heuristicsSection) {
    profile.heuristics = []
    for (const line of heuristicsSection.split('\n')) {
      const hMatch = line.match(/\d+\.\s+\*\*([^*]+)\*\*[（(]适用场景[：:]([^）)]+)[）)]/)
      if (hMatch) {
        profile.heuristics.push({ rule: hMatch[1].trim(), scenario: hMatch[2].trim() })
      }
    }
  }

  // 表达DNA
  const dnaSection = extractSection(md, '表达DNA')
  if (dnaSection) {
    const dna: ExpressionDNA = { vocabulary: [], phrases: [], style: '' }
    for (const line of dnaSection.split('\n')) {
      const trim = line.replace(/^- /, '').trim()
      if (trim.startsWith('常用词汇')) {
        dna.vocabulary = trim.replace(/^常用词汇[：:]\s*/, '').split(/[、,，]/).map(s => s.trim()).filter(Boolean)
      } else if (trim.startsWith('口头禅')) {
        dna.phrases = trim.replace(/^口头禅[：:]\s*/, '').split(/[、,，]/).map(s => s.trim()).filter(Boolean)
      } else if (trim.startsWith('表达风格')) {
        dna.style = trim.replace(/^表达风格[：:]\s*/, '').trim()
      }
    }
    if (dna.vocabulary.length || dna.phrases.length || dna.style) {
      profile.expressionDNA = dna
    }
  }

  // 价值观
  const valuesSection = extractSection(md, '价值观')
  if (valuesSection) {
    profile.values = []
    for (const line of valuesSection.split('\n')) {
      const vMatch = line.match(/\d+\.\s+(.+)/)
      if (vMatch) {
        const valueText = vMatch[1].trim()
        profile.values.push({ value: valueText, priority: profile.values.length + 1 })
      }
    }
  }

  // 反模式
  const antiSection = extractSection(md, '反模式')
  if (antiSection) {
    profile.antiPatterns = []
    for (const line of antiSection.split('\n')) {
      const aMatch = line.match(/\d+\.\s+(.+)/)
      if (aMatch) profile.antiPatterns.push(aMatch[1].trim())
    }
  }

  // 内在张力
  const tensionsSection = extractSection(md, '内在张力')
  if (tensionsSection) {
    profile.tensions = []
    for (const line of tensionsSection.split('\n')) {
      const tMatch = line.match(/\d+\.\s+\*\*([^*]+)\*\*\s*vs\s*\*\*([^*]+)\*\*[：:]\s*(.+)/)
      if (tMatch) {
        profile.tensions.push({
          left: tMatch[1].trim(),
          right: tMatch[2].trim(),
          description: tMatch[3].trim(),
        })
      }
    }
  }

  // 知识边界
  const kbSection = extractSection(md, '知识边界')
  if (kbSection) {
    const kb: KnowledgeBoundary = { known: [], unknown: [] }
    for (const line of kbSection.split('\n')) {
      const trim = line.replace(/^- /, '').trim()
      if (trim.startsWith('你擅长的')) {
        kb.known = trim.replace(/^你擅长的[：:]\s*/, '').split(/[、,，]/).map(s => s.trim()).filter(Boolean)
      } else if (trim.startsWith('你不了解的')) {
        kb.unknown = trim.replace(/^你不了解的[：:]\s*/, '').split(/[、,，]/).map(s => s.trim()).filter(Boolean)
      }
    }
    if (kb.known.length || kb.unknown.length) {
      profile.knowledgeBoundary = kb
    }
  }

  return profile
}

/** 提取 Markdown 中指定标题下的文本内容 */
function extractSection(md: string, title: string): string | null {
  const regex = new RegExp(`##\\s*${title}[\\s\\n]*([^#]*)`, 'i')
  const match = md.match(regex)
  if (!match) return null
  return match[1].trim()
}
