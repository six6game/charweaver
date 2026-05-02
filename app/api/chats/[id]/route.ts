import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET - 获取单个对话
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chat = await prisma.chat.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })
    
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }
    
    return NextResponse.json(chat)
  } catch (error) {
    console.error('Failed to fetch chat:', error)
    return NextResponse.json({ error: 'Failed to fetch chat' }, { status: 500 })
  }
}

// PATCH - 更新对话
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { title } = body
    
    const chat = await prisma.chat.update({
      where: { id: params.id },
      data: { title }
    })
    
    return NextResponse.json(chat)
  } catch (error) {
    console.error('Failed to update chat:', error)
    return NextResponse.json({ error: 'Failed to update chat' }, { status: 500 })
  }
}

// DELETE - 删除对话
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.chat.delete({
      where: { id: params.id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete chat:', error)
    return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 })
  }
}
