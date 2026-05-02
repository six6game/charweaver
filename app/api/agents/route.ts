import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET - 获取所有Agent
export async function GET() {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(agents)
  } catch (error) {
    console.error('Failed to fetch agents:', error)
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
  }
}

// POST - 创建新Agent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const agent = await prisma.agent.create({
      data: {
        name: body.name,
        description: body.description,
        avatar: body.avatar,
        avatarColor: body.avatarColor || '#6366f1',
        greeting: body.greeting,
        personality: body.personality,
        background: body.background,
        mentalModels: body.mentalModels,
        heuristics: body.heuristics,
        expressionDNA: body.expressionDNA,
        values: body.values,
        antiPatterns: body.antiPatterns,
        tensions: body.tensions,
        knowledgeBoundary: body.knowledgeBoundary,
        systemPrompt: body.systemPrompt || '',
        temperature: body.temperature || 0.7,
        maxTokens: body.maxTokens || 4096,
        model: body.model || 'deepseek-chat',
        isDefault: body.isDefault || false
      }
    })
    
    return NextResponse.json(agent)
  } catch (error: any) {
    console.error('Failed to create agent:', error)
    // Prisma P2002 = 唯一约束冲突
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: `角色名「${body.name}」已存在，请换个名称` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 })
  }
}
