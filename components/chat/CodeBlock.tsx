'use client'

import { useState, useCallback, useEffect } from 'react'
import { Copy, Check, Download, Play, Loader2, X, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  code: string
  language?: string
}

const RUNNABLE_LANGUAGES = ['html', 'javascript', 'js', 'python', 'py']

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [running, setRunning] = useState(false)
  const [runOutput, setRunOutput] = useState<{ type: 'output' | 'error'; content: string } | null>(null)
  const [sandboxSrc, setSandboxSrc] = useState('')

  const lang = language?.toLowerCase() || ''
  const canRun = RUNNABLE_LANGUAGES.includes(lang)
  const isHtml = lang === 'html'
  const isJs = ['javascript', 'js'].includes(lang)
  const isPython = ['python', 'py'].includes(lang)
  const isWeb = isHtml || isJs

  // ESC 关闭
  useEffect(() => {
    if (!showModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal])

  const closeModal = () => {
    setShowModal(false)
    setRunOutput(null)
    setSandboxSrc('')
  }

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  const handleDownload = useCallback(() => {
    const ext = isHtml ? 'html' : isJs ? 'js' : isPython ? 'py' : 'txt'
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `code.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }, [code, isHtml, isJs, isPython])

  // 运行
  const handleRun = useCallback(async () => {
    setShowModal(true)
    setRunning(true)
    setRunOutput(null)

    try {
      if (isWeb) {
        const src = isHtml
          ? code
          : `<html><body><script>${code}<\/script></body></html>`
        setSandboxSrc(src)
        setRunning(false)
      } else if (isPython) {
        const res = await fetch('/api/run-python', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        const data = await res.json()
        setRunOutput({
          type: data.error ? 'error' : 'output',
          content: data.error || data.output || '(无输出)',
        })
        setRunning(false)
      }
    } catch (err: any) {
      setRunOutput({ type: 'error', content: err.message || '运行失败' })
      setRunning(false)
    }
  }, [code, isHtml, isJs, isPython])

  return (
    <>
      {/* 代码块 */}
      <div className="relative my-3 rounded-lg border border-border overflow-hidden bg-[#1e1e2e] dark:bg-[#1e1e2e]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#2a2a3e] border-b border-white/10">
          <span className="text-xs text-gray-400 font-mono">
            {language || 'code'}
          </span>
          <div className="flex items-center gap-1">
            {canRun && (
              <button
                onClick={handleRun}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
                title={`运行${language}（浮窗）`}
              >
                <Play className="w-3 h-3" />
                <span>运行</span>
              </button>
            )}
            <button
              onClick={handleDownload}
              className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="下载"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              title="复制"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-gray-400 hover:text-white" />
              )}
            </button>
          </div>
        </div>

        {/* Code */}
        <pre className="p-4 overflow-x-auto">
          <code className="text-sm font-mono text-gray-200 leading-relaxed whitespace-pre">
            {code}
          </code>
        </pre>
      </div>

      {/* 沙箱浮窗 */}
      {showModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-3xl max-h-[85vh] bg-background rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-secondary/50">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Terminal className="w-4 h-4 text-muted-foreground" />
                <span>运行 — {language || 'code'}</span>
              </div>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 运行结果区域 */}
            <div className="flex-1 overflow-auto bg-white dark:bg-black/20">
              {running ? (
                <div className="flex items-center justify-center h-40 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>运行中...</span>
                </div>
              ) : isWeb && sandboxSrc ? (
                <iframe
                  srcDoc={sandboxSrc}
                  sandbox="allow-scripts"
                  className="w-full h-[500px] border-0"
                  title="沙箱"
                />
              ) : runOutput ? (
                <div className={cn(
                  "p-5 text-sm font-mono whitespace-pre-wrap",
                  runOutput.type === 'error'
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-800 dark:text-gray-200"
                )}>
                  {runOutput.type === 'error' && (
                    <div className="flex items-center gap-1.5 mb-2 text-red-500 text-xs font-medium uppercase tracking-wider">
                      错误
                    </div>
                  )}
                  {runOutput.content}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
