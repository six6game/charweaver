import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET - 获取所有对话
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const agentId = searchParams.get('agentId')
  
  try {
    const chats = await prisma.chat.findMany({
      where: agentId ? { agentId } : undefined,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
    
    return NextResponse.json(chats)
  } catch (error) {
    console.error('Failed to fetch chats:', error)
    return NextResponse.json({ error: 'Failed to fetch chats' }, { status: 500 })
  }
}

// POST - 创建新对话
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agentId, title } = body
    
    const chat = await prisma.chat.create({
      data: {
        title: title || '新对话',
        agentId
      },
      include: {
        messages: true
      }
    })
    
    return NextResponse.json(chat)
  } catch (error) {
    console.error('Failed to create chat:', error)
    return NextResponse.json({ error: 'Failed to create chat' }, { status: 500 })
  }
}
