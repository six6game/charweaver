'use client'

import { useState, useRef, useEffect } from 'react'
import { Brain, ChevronDown, ChevronUp, Copy, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReasoningBoxProps {
  content: string
  isStreaming: boolean
}

export default function ReasoningBox({ content, isStreaming }: ReasoningBoxProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const prevContentRef = useRef('')

  // 流式时自动展开；流结束后自动折叠
  useEffect(() => {
    if (isStreaming) {
      setCollapsed(false)
    } else if (content && !prevContentRef.current) {
      // 初始有内容（非流式，如 socks5 降级）
      // 不折叠
    }
    prevContentRef.current = content
  }, [isStreaming, content])

  // 流结束后 500ms 自动折叠
  useEffect(() => {
    if (!isStreaming && content) {
      const timer = setTimeout(() => setCollapsed(true), 500)
      return () => clearTimeout(timer)
    }
  }, [isStreaming, content])

  // 自动滚动到底部
  useEffect(() => {
    if (contentRef.current && !collapsed) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [content, collapsed])

  if (!content) return null

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mb-3 border border-primary/20 rounded-lg overflow-hidden bg-primary/5">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none hover:bg-primary/10 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2 text-xs font-medium text-primary">
          <Brain className="w-3.5 h-3.5" />
          <span>深度思考</span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              思考中...
            </span>
          )}
          {!isStreaming && content && (
            <span className="text-muted-foreground font-normal">
              ({content.length}字)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* 复制 */}
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy() }}
            className="p-1 rounded hover:bg-primary/20 transition-colors"
            title="复制推理内容"
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <Copy className="w-3 h-3 text-primary/60" />
            )}
          </button>
          {/* 展开/折叠 */}
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5 text-primary/60" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-primary/60" />
          )}
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div
          ref={contentRef}
          className="px-3 py-2 max-h-[300px] overflow-y-auto border-t border-primary/10"
        >
          <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {content}
          </div>
          {isStreaming && (
            <div className="flex items-center gap-1 mt-2 text-primary/60">
              <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
