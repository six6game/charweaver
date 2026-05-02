/**
 * POST /api/agents/[id]/memory/import — 导入记忆
 */
import { NextRequest, NextResponse } from 'next/server'
import { saveAgentMemory, saveAgentMemoryConfig } from '@/lib/agent-memory'
import { initAgentMemoryScheduler } from '@/lib/agent-memory-scheduler'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { content, config } = body
    if (content) saveAgentMemory(params.id, content)
    if (config) saveAgentMemoryConfig(params.id, config)
    if (config) initAgentMemoryScheduler(params.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to import agent memory:', error)
    return NextResponse.json({ error: '导入失败' }, { status: 500 })
  }
}
