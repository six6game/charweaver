/**
 * POST /api/agents/[id]/memory/analyze — 立即触发记忆分析
 */
import { NextRequest, NextResponse } from 'next/server'
import { runAgentMemoryUpdate } from '@/lib/agent-memory-scheduler'
import { loadAgentMemory } from '@/lib/agent-memory'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await runAgentMemoryUpdate(params.id)
    if (result) {
      const content = loadAgentMemory(params.id)
      return NextResponse.json({ success: true, content })
    }
    return NextResponse.json({ success: false, message: '分析失败或数据不足' })
  } catch (error) {
    console.error('Failed to analyze agent memory:', error)
    return NextResponse.json({ error: '分析失败' }, { status: 500 })
  }
}
