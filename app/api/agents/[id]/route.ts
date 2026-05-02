import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteAgentMemory } from '@/lib/agent-memory'
import { stopAgentMemoryScheduler } from '@/lib/agent-memory-scheduler'

// GET - 获取单个Agent
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: params.id }
    })
    
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    
    return NextResponse.json(agent)
  } catch (error) {
    console.error('Failed to fetch agent:', error)
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 })
  }
}

// PATCH - 更新Agent
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    
    const agent = await prisma.agent.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.avatar !== undefined && { avatar: body.avatar }),
        ...(body.avatarColor !== undefined && { avatarColor: body.avatarColor }),
        ...(body.greeting !== undefined && { greeting: body.greeting }),
        ...(body.personality !== undefined && { personality: body.personality }),
        ...(body.background !== undefined && { background: body.background }),
        ...(body.mentalModels !== undefined && { mentalModels: body.mentalModels }),
        ...(body.heuristics !== undefined && { heuristics: body.heuristics }),
        ...(body.expressionDNA !== undefined && { expressionDNA: body.expressionDNA }),
        ...(body.values !== undefined && { values: body.values }),
        ...(body.antiPatterns !== undefined && { antiPatterns: body.antiPatterns }),
        ...(body.tensions !== undefined && { tensions: body.tensions }),
        ...(body.knowledgeBoundary !== undefined && { knowledgeBoundary: body.knowledgeBoundary }),
        ...(body.systemPrompt !== undefined && { systemPrompt: body.systemPrompt }),
        ...(body.temperature !== undefined && { temperature: body.temperature }),
        ...(body.maxTokens !== undefined && { maxTokens: body.maxTokens }),
        ...(body.model !== undefined && { model: body.model }),
        ...(body.isDefault !== undefined && { isDefault: body.isDefault })
      }
    })
    
    return NextResponse.json(agent)
  } catch (error: any) {
    console.error('Failed to update agent:', error)
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: `角色名「${body.name}」已被占用` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
  }
}

// DELETE - 删除Agent
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.agent.delete({
      where: { id: params.id }
    })
    
    // 删除角色记忆文件
    stopAgentMemoryScheduler(params.id)
    deleteAgentMemory(params.id)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete agent:', error)
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 })
  }
}
