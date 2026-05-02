/**
 * GET/PUT /api/agents/[id]/memory/config
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadAgentMemoryConfig, saveAgentMemoryConfig } from '@/lib/agent-memory'
import { initAgentMemoryScheduler } from '@/lib/agent-memory-scheduler'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const config = loadAgentMemoryConfig(params.id)
    return NextResponse.json({ config })
  } catch (error) {
    console.error('Failed to load memory config:', error)
    return NextResponse.json({ error: '加载配置失败' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const config = saveAgentMemoryConfig(params.id, body)
    // 配置变更后重启调度器
    initAgentMemoryScheduler(params.id)
    return NextResponse.json({ success: true, config })
  } catch (error) {
    console.error('Failed to save memory config:', error)
    return NextResponse.json({ error: '保存配置失败' }, { status: 500 })
  }
}
