/**
 * 用户画像 API
 * - GET  /api/profile  — 获取当前用户画像
 * - POST /api/profile  — 更新用户画像
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadUserProfile, saveUserProfile } from '@/lib/user-profile'

export async function GET() {
  try {
    const profile = loadUserProfile()
    if (!profile) {
      return NextResponse.json({ profile: null, message: '用户画像尚未生成' })
    }
    return NextResponse.json({ profile })
  } catch (error) {
    console.error('Failed to load user profile:', error)
    return NextResponse.json({ error: '加载用户画像失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { content } = body
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }
    saveUserProfile(content)
    return NextResponse.json({ success: true, message: '用户画像已更新' })
  } catch (error) {
    console.error('Failed to save user profile:', error)
    return NextResponse.json({ error: '保存用户画像失败' }, { status: 500 })
  }
}
