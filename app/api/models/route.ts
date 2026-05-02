import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET - 获取所有模型配置
export async function GET() {
  try {
    const configs = await prisma.modelConfig.findMany({
      orderBy: { createdAt: 'asc' }
    })
    return NextResponse.json(configs)
  } catch (error) {
    console.error('Failed to fetch model configs:', error)
    return NextResponse.json({ error: 'Failed to fetch model configs' }, { status: 500 })
  }
}

// POST - 创建或更新模型配置（每个 provider 只保留一条）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, name, apiKey, baseUrl, enabled, isDefault } = body
    
    // 先清理同 provider 下其他已废弃的配置（防止切换模型名后残留旧记录）
    await prisma.modelConfig.deleteMany({
      where: { 
        provider,
        name: { not: name }
      }
    })
    
    // 如果设置为默认，先取消所有其他默认（全局唯一）
    if (isDefault) {
      await prisma.modelConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      })
    }
    
    const config = await prisma.modelConfig.upsert({
      where: { 
        provider_name: {
          provider,
          name
        }
      },
      create: {
        provider,
        name,
        apiKey,
        baseUrl: baseUrl || '',
        enabled: enabled !== false,
        isDefault: isDefault || false
      },
      update: {
        apiKey,
        baseUrl,
        enabled,
        isDefault
      }
    })
    
    return NextResponse.json(config)
  } catch (error) {
    console.error('Failed to save model config:', error)
    return NextResponse.json({ error: 'Failed to save model config' }, { status: 500 })
  }
}
