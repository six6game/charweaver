/**
 * POST /api/agents/[id]/memory/export — 导出记忆
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadAgentMemory, loadAgentMemoryConfig } from '@/lib/agent-memory'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const content = loadAgentMemory(params.id)
    const config = loadAgentMemoryConfig(params.id)
    return NextResponse.json({
      content,
      config,
      exportedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Failed to export agent memory:', error)
    return NextResponse.json({ error: '导出失败' }, { status: 500 })
  }
}
