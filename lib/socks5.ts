/**
 * SOCKS5 代理工具
 * 
 * 使用 Node.js 内置 net + tls 模块手动创建 SOCKS5 隧道，
 * 并自动完成 TLS 握手（用于 HTTPS 请求）。
 * 不依赖任何第三方包。
 */

import net from 'net'
import tls from 'tls'

// SOCKS5 协议命令
const CMD = { CONNECT: 0x01 }
const ATYP = { IPV4: 0x01, DOMAIN: 0x03, IPV6: 0x04 }

/**
 * 通过 SOCKS5 代理建立 TLS 加密连接
 */
function socks5ConnectTLS(
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  timeout = 15000
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    let destroyed = false

    const cleanup = (err?: Error) => {
      if (!destroyed) {
        destroyed = true
        socket.destroy()
        reject(err || new Error('SOCKS5 connection failed'))
      }
    }

    socket.setTimeout(timeout)
    socket.on('timeout', () => cleanup(new Error('SOCKS5 connection timeout')))
    socket.on('error', (err) => cleanup(err))

    socket.connect(proxyPort, proxyHost, () => {
      // Step 1: 协商（无认证）
      socket.write(Buffer.from([0x05, 0x01, 0x00]))

      socket.once('data', (data: Buffer) => {
        if (data[0] !== 0x05 || data[1] !== 0x00) {
          return cleanup(new Error('SOCKS5 auth failed'))
        }

        // Step 2: 连接目标
        const targetHostBytes = Buffer.from(targetHost, 'utf-8')
        const buf = Buffer.alloc(4 + 1 + targetHostBytes.length + 2)
        buf[0] = 0x05
        buf[1] = CMD.CONNECT
        buf[2] = 0x00
        buf[3] = ATYP.DOMAIN
        buf[4] = targetHostBytes.length
        targetHostBytes.copy(buf, 5)
        buf.writeUInt16BE(targetPort, buf.length - 2)

        socket.write(buf)
        socket.once('data', (resp: Buffer) => {
          if (resp[0] !== 0x05 || resp[1] !== 0x00) {
            return cleanup(new Error(`SOCKS5 connect failed: ${resp[1]}`))
          }

          // SOCKS5 隧道建立成功，在此基础上包裹 TLS
          const tlsSocket = tls.connect({
            socket: socket,
            host: targetHost,
            servername: targetHost,
            rejectUnauthorized: false // 允许自签名证书
          })

          tlsSocket.once('secureConnect', () => {
            socket.setTimeout(0)
            if (!destroyed) {
              destroyed = true
              resolve(tlsSocket)
            }
          })

          tlsSocket.on('error', (err) => {
            cleanup(err)
          })
        })
      })
    })
  })
}

/**
 * 通过 SOCKS5 代理发起 HTTPS 请求
 * 返回 response body（string）
 */
export async function socks5Fetch(
  proxyUrl: string,
  targetUrl: string,
  init?: RequestInit
): Promise<string> {
  const parsedProxy = new URL(proxyUrl)
  const parsedTarget = new URL(targetUrl)

  const headers = (init?.headers || {}) as Record<string, string>
  const body = typeof init?.body === 'string' ? init.body : ''

  // 通过 SOCKS5 + TLS 建立加密连接
  const socket = await socks5ConnectTLS(
    parsedProxy.hostname,
    parseInt(parsedProxy.port) || 1080,
    parsedTarget.hostname,
    parseInt(parsedTarget.port) || 443
  )

  // 构建 HTTPS 请求
  const reqLines = [
    `POST ${parsedTarget.pathname}${parsedTarget.search} HTTP/1.1`,
    `Host: ${parsedTarget.hostname}`,
    'Connection: close',
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
    'Content-Length: ' + Buffer.byteLength(body),
    '',
    body
  ]

  return new Promise((resolve, reject) => {
    let responseData = ''
    let headersDone = false
    let contentLength = 0

    socket.write(reqLines.join('\r\n'))

    socket.on('data', (chunk: Buffer) => {
      responseData += chunk.toString()

      if (!headersDone) {
        const headerEnd = responseData.indexOf('\r\n\r\n')
        if (headerEnd !== -1) {
          headersDone = true
          const headerBlock = responseData.substring(0, headerEnd)
          const statusLine = headerBlock.split('\r\n')[0]
          const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/)
          if (statusMatch && statusMatch[1] !== '200') {
            const responseBody = responseData.substring(headerEnd + 4)
            const err = new Error(`HTTP ${statusMatch[1]}: ${responseBody.substring(0, 500)}`)
            ;(err as any).statusCode = statusMatch[1]
            ;(err as any).responseBody = responseBody
            reject(err)
            socket.destroy()
            return
          }
          const clMatch = headerBlock.match(/content-length:\s*(\d+)/i)
          if (clMatch) contentLength = parseInt(clMatch[1])
          responseData = responseData.substring(headerEnd + 4)
        }
      }

      if (headersDone && contentLength > 0 && responseData.length >= contentLength) {
        socket.destroy()
        resolve(responseData)
      }
    })

    socket.on('error', reject)
    socket.on('close', () => {
      if (responseData) resolve(responseData)
      else reject(new Error('Connection closed'))
    })
  })
}

/**
 * 从环境变量获取代理地址
 */
export function getProxyUrl(): string | null {
  return process.env.HTTP_PROXY || process.env.HTTPS_PROXY || null
}
