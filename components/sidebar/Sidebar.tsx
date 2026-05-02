'use client'

import { useChatStore } from '@/stores/chat-store'
import { cn, formatDate } from '@/lib/utils'
import { 
  Plus, 
  Settings, 
  MessageSquare,
  Bot,
  Trash2,
  Pencil,
  ChevronRight,
  ChevronLeft
} from 'lucide-react'
import { useState } from 'react'

export default function Sidebar() {
  const { 
    agents, 
    currentAgent, 
    setCurrentAgent, 
    chats, 
    currentChat, 
    setCurrentChat,
    setCreatingAgent,
    setEditingAgent,
    setSettingsOpen,
    isSettingsOpen
  } = useChatStore()
  
  const [showAgents, setShowAgents] = useState(true)
  const [showChats, setShowChats] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  
  const handleNewChat = async () => {
    if (!currentAgent) return
    
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: currentAgent.id, title: '新对话' })
      })
      const chat = await res.json()
      setCurrentChat(chat)
      
      // 刷新对话列表
      const chatsRes = await fetch(`/api/chats?agentId=${currentAgent.id}`)
      const chatsData = await chatsRes.json()
      useChatStore.getState().setChats(chatsData)
    } catch (error) {
      console.error('Failed to create chat:', error)
    }
  }
  
  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation()
    if (!confirm('确定要删除这个对话吗？')) return
    
    try {
      await fetch(`/api/chats/${chatId}`, { method: 'DELETE' })
      
      // 如果删除的是当前对话，清空选中状态
      if (currentChat?.id === chatId) {
        setCurrentChat(null)
      }
      
      // 刷新对话列表
      if (currentAgent) {
        const chatsRes = await fetch(`/api/chats?agentId=${currentAgent.id}`)
        const chatsData = await chatsRes.json()
        useChatStore.getState().setChats(chatsData)
      }
    } catch (error) {
      console.error('Failed to delete chat:', error)
    }
  }
  
  const handleDeleteAgent = async (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation()
    if (!confirm('确定要删除这个角色吗？')) return
    
    try {
      await fetch(`/api/agents/${agentId}`, { method: 'DELETE' })
      
      // 刷新角色列表
      const agentsRes = await fetch('/api/agents')
      const agentsData = await agentsRes.json()
      useChatStore.getState().setAgents(agentsData)
      
      // 如果删除的是当前角色，清空选中状态
      if (currentAgent?.id === agentId) {
        useChatStore.getState().setCurrentAgent(null)
        useChatStore.getState().setCurrentChat(null)
        useChatStore.getState().setChats([])
      }
    } catch (error) {
      console.error('Failed to delete agent:', error)
    }
  }
  
  return (
    <div className={cn(
      "h-screen border-r border-border bg-card flex flex-col transition-all duration-200",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        {!collapsed && (
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary shrink-0" />
            CharWeaver
          </h1>
        )}
        {collapsed && (
          <Bot className="w-6 h-6 text-primary mx-auto" />
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Agents Section */}
        <div className="mb-4">
          {!collapsed ? (
            <>
              <button 
                onClick={() => setShowAgents(!showAgents)}
                className="flex items-center justify-between w-full px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>角色</span>
                <ChevronRight className={cn("w-4 h-4 transition-transform", showAgents && "rotate-90")} />
              </button>
              
              {showAgents && (
                <div className="mt-1 space-y-1">
                  {agents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => setCurrentAgent(agent)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setEditingAgent(agent)
                      }}
                      className={cn(
                        "group w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                        currentAgent?.id === agent.id 
                          ? "bg-primary/10 text-primary" 
                          : "hover:bg-secondary text-foreground"
                      )}
                    >
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                        style={{ backgroundColor: agent.avatarColor }}
                      >
                        {agent.name[0]}
                      </div>
                      <span className="flex-1 text-left truncate">{agent.name}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingAgent(agent) }}
                          className="p-1 hover:bg-secondary rounded"
                          title="编辑"
                        >
                          <Pencil className="w-3 h-3 text-muted-foreground" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteAgent(e, agent.id)}
                          className="p-1 hover:bg-destructive/10 rounded"
                          title="删除"
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      </div>
                    </button>
                  ))}
                  
                  <button
                    onClick={() => setCreatingAgent(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>新建角色</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            /* 折叠模式下显示角色头像 */
            <div className="flex flex-col items-center gap-1">
              {agents.slice(0, 5).map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setCurrentAgent(agent)}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium transition-all",
                    currentAgent?.id === agent.id 
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-card scale-110" 
                      : "hover:opacity-80"
                  )}
                  style={{ backgroundColor: agent.avatarColor }}
                  title={agent.name}
                >
                  {agent.name[0]}
                </button>
              ))}
              <button
                onClick={() => setCreatingAgent(true)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors text-lg"
                title="新建角色"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        
        {/* Chats Section */}
        {currentAgent && !collapsed && (
          <div>
            <button 
              onClick={() => setShowChats(!showChats)}
              className="flex items-center justify-between w-full px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>对话 ({chats.length})</span>
              <ChevronRight className={cn("w-4 h-4 transition-transform", showChats && "rotate-90")} />
            </button>
            
            {showChats && (
              <div className="mt-1 space-y-1">
                <button
                  onClick={handleNewChat}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>新对话</span>
                </button>
                
                {chats.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => setCurrentChat(chat)}
                    className={cn(
                      "w-full group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                      currentChat?.id === chat.id 
                        ? "bg-primary/10 text-primary" 
                        : "hover:bg-secondary text-foreground"
                    )}
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <div className="flex-1 text-left truncate">
                      <div className="truncate">{chat.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(chat.updatedAt)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteChat(e, chat.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded shrink-0"
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </button>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="p-2 border-t border-border">
        <button
          onClick={() => setSettingsOpen(!isSettingsOpen)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors",
            collapsed ? "justify-center w-full" : "w-full"
          )}
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span>设置</span>}
        </button>
      </div>
    </div>
  )
}
