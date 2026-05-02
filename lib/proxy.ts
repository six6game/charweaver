/**
 * 系统代理检测工具
 * 
 * 检测 Windows 系统代理并设置环境变量 HTTP_PROXY / HTTPS_PROXY，
 * 使 Node.js fetch 能走 VPN 代理出站（解决国内访问 x.ai 等被墙域名的问题）。
 */
import { execSync } from 'child_process'

let detected = false

/**
 * 检测系统代理并设置环境变量（仅在第一次调用时执行）
 */
export function ensureProxyEnv(): void {
  if (detected) return
  detected = true

  // 如果环境变量已存在，直接使用
  if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
    console.log(`[Proxy] Using env: HTTP_PROXY=${process.env.HTTP_PROXY}`)
    return
  }

  // 尝试读取 Windows 注册表中的系统代理设置
  try {
    const enabled = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
      { encoding: 'utf-8', timeout: 3000 }
    )
    if (enabled.includes('0x1')) {
      const server = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
        { encoding: 'utf-8', timeout: 3000 }
      )
      const match = server.match(/\s+ProxyServer\s+REG_SZ\s+(\S+)/)
      if (match) {
        const proxy = `http://${match[1]}`
        process.env.HTTP_PROXY = proxy
        process.env.HTTPS_PROXY = proxy
        console.log(`[Proxy] System proxy detected: ${proxy}`)
        return
      }
    }
  } catch {
    // reg query failed (e.g. sandbox restriction)
  }

  console.log('[Proxy] No proxy detected')
}
