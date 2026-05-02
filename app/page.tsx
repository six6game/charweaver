'use client'

import { useEffect, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import Sidebar from '@/components/sidebar/Sidebar'
import ChatArea from '@/components/chat/ChatArea'
import SettingsPanel from '@/components/settings/SettingsPanel'
import AgentModal from '@/components/agents/AgentModal'
import { Loader2 } from 'lucide-react'

export default function Home() {
  const [loading, setLoading] = useState(true)
  const { setAgents, setModelConfigs, setChats, currentAgent, setCurrentAgent, agents } = useChatStore()
  
  useEffect(() => {
    async function init() {
      try {
        // 初始化默认数据
        await fetch('/api/init', { method: 'POST' })
        
        // 加载agents
        const agentsRes = await fetch('/api/agents')
        const agentsData = await agentsRes.json()
        setAgents(agentsData)
        
        // 如果没有当前选中的agent，设置默认的
        if (agentsData.length > 0 && !currentAgent) {
          const defaultAgent = agentsData.find((a: any) => a.isDefault) || agentsData[0]
          setCurrentAgent(defaultAgent)
        }
        
        // 加载模型配置
        const modelsRes = await fetch('/api/models')
        const modelsData = await modelsRes.json()
        setModelConfigs(modelsData)
        
        // 加载对话（如果有选中的agent）
        if (currentAgent) {
          const chatsRes = await fetch(`/api/chats?agentId=${currentAgent.id}`)
          const chatsData = await chatsRes.json()
          setChats(chatsData)
        }
        
      } catch (error) {
        console.error('Failed to initialize:', error)
      } finally {
        setLoading(false)
      }
    }
    
    init()
  }, [])
  
  // 当agent改变时加载对话
  useEffect(() => {
    if (currentAgent) {
      fetch(`/api/chats?agentId=${currentAgent.id}`)
        .then(res => res.json())
        .then(setChats)
    }
  }, [currentAgent, setChats])
  
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">加载中...</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <ChatArea />
      <SettingsPanel />
      <AgentModal />
    </div>
  )
}
