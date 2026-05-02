/**
 * 用户画像配置 API
 * - GET  /api/profile/config    — 获取当前配置
 * - POST /api/profile/config    — 更新配置
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadProfileConfig, saveProfileConfig } from '@/lib/user-profile'

// 调度器懒初始化（只在运行时触发，不经过 webpack 打包）
let schedulerInitialized = false
async function ensureScheduler() {
  if (schedulerInitialized) return
  schedulerInitialized = true
  try {
    const { initProfileScheduler } = await import('@/lib/scheduler')
    initProfileScheduler()
  } catch (err) {
    console.error('Failed to init profile scheduler:', err)
  }
}

export async function GET() {
  try {
    // 懒初始化调度器（第一次请求时启动后台任务）
    ensureScheduler()
    
    const config = loadProfileConfig()
    return NextResponse.json({ config })
  } catch (error) {
    console.error('Failed to load profile config:', error)
    return NextResponse.json({ error: '加载配置失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const config = saveProfileConfig(body)
    return NextResponse.json({ success: true, config })
  } catch (error) {
    console.error('Failed to save profile config:', error)
    return NextResponse.json({ error: '保存配置失败' }, { status: 500 })
  }
}
