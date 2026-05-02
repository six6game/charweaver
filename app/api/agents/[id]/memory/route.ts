/**
 * GET/PUT /api/agents/[id]/memory
 * GET  — 获取记忆内容
 * PUT  — 手动更新记忆内容
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadAgentMemory, saveAgentMemory } from '@/lib/agent-memory'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const content = loadAgentMemory(params.id)
    return NextResponse.json({ content })
  } catch (error) {
    console.error('Failed to load agent memory:', error)
    return NextResponse.json({ error: '加载失败' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { content } = body
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }
    saveAgentMemory(params.id, content)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save agent memory:', error)
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
