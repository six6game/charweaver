/**
 * Python 代码安全运行 API
 * 在受限子进程中执行简单 Python 代码，返回 stdout/stderr
 * 安全限制：
 *   - 超时 10 秒
 *   - 禁止危险模块（os, subprocess, sys, shutil 等）
 *   - 禁止文件写入
 *   - 内存限制由操作系统隐含控制
 */
import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// Python 安全沙箱脚本前缀
const SANDBOX_PREFIX = `
import builtins
import sys
from io import StringIO

# 禁止的危险模块
_BLOCKED_MODULES = ['os', 'subprocess', 'sys', 'shutil', 'socket', 'ctypes',
                    'signal', 'multiprocessing', 'threading', 'pickle',
                    'importlib', 'inspect', 'atexit', 'gc', 'code', 'codeop',
                    'pty', 'tty', 'termios', 'fcntl', 'resource']

_ORIGINAL_IMPORT = builtins.__import__

def _safe_import(name, *args, **kwargs):
    if name in _BLOCKED_MODULES or name.split('.')[0] in _BLOCKED_MODULES:
        raise ImportError(f"Module '{name}' is not allowed for security reasons")
    return _ORIGINAL_IMPORT(name, *args, **kwargs)

builtins.__import__ = _safe_import

# 禁止写文件
_ORIGINAL_OPEN = builtins.open
def _safe_open(file, mode='r', *args, **kwargs):
    if 'w' in mode or 'a' in mode or 'x' in mode:
        raise PermissionError("File writing is not allowed")
    return _ORIGINAL_OPEN(file, mode, *args, **kwargs)

builtins.open = _safe_open

# 重定向输出
_output = StringIO()
_old_stdout = sys.stdout
sys.stdout = _output

try:
`

const SANDBOX_SUFFIX = `
finally:
    sys.stdout = _old_stdout
    output = _output.getvalue()
    print(output, end='')
    _output.close()
`

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json()
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: '代码不能为空' }, { status: 400 })
    }

    // 限制代码长度
    if (code.length > 5000) {
      return NextResponse.json({ error: '代码过长（最多 5000 字符）' }, { status: 400 })
    }

    // 写入临时文件
    const tmpDir = path.join(process.cwd(), '.tmp-python')
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
    const tmpFile = path.join(tmpDir, `run_${crypto.randomBytes(8).toString('hex')}.py`)

    const wrappedCode = SANDBOX_PREFIX + code + '\n' + SANDBOX_SUFFIX
    fs.writeFileSync(tmpFile, wrappedCode, 'utf-8')

    try {
      const output = execSync(
        `"${process.env.PYTHON_PATH || 'python'}" "${tmpFile}"`,
        { timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true }
      ).toString().trim()

      return NextResponse.json({ output })
    } catch (execError: any) {
      const stderr = execError.stderr?.toString() || ''
      const stdout = execError.stdout?.toString() || ''

      // 清理错误信息中的文件路径
      const cleanError = (stderr || stdout || execError.message || '未知错误')
        .replace(new RegExp(tmpFile.replace(/\\/g, '\\\\'), 'g'), '<code>')
        .replace(/File ".*?", line /g, '行 ')

      return NextResponse.json({ error: cleanError }, { status: 200 })
    } finally {
      // 清理临时文件
      try { fs.unlinkSync(tmpFile) } catch {}
    }
  } catch (err: any) {
    console.error('Python run error:', err)
    return NextResponse.json({ error: err.message || '执行失败' }, { status: 500 })
  }
}
