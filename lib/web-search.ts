/**
 * 网络搜索提示词工具
 * 
 * 由于服务器环境无法直接调用外部搜索 API，
 * 改为通过系统提示词 + enable_search 参数触发模型的联网搜索能力。
 * 
 * 支持的平台：
 * - 阿里云百炼 DashScope (baseUrl: https://dashscope.aliyuncs.com/compatible-mode/v1)
 * - 腾讯云 (baseUrl: https://api.lkeap.cloud.tencent.com/v1)
 * - DeepSeek 官方 API 需要账号开启联网搜索功能
 * - xAI Grok 支持 enable_search 参数
 */

/**
 * 生成搜索提示词，注入到 system message 中
 */
export function getSearchSystemPrompt(query: string): string {
  return `【联网搜索请求】
用户要求针对以下问题进行联网搜索：
"${query}"

如果你具备联网搜索能力（支持 enable_search 参数），请直接启用搜索获取最新信息并据此回答。
如果你不具备联网搜索能力，请明确告知用户当前模型不支持联网搜索，并建议配置支持搜索的 API 提供商（如阿里云百炼、腾讯云等）。
`
}

/**
 * 生成搜索结果格式，用于粘贴搜索结果
 * （当有外部搜索结果时使用）
 */
export function formatSearchResults(query: string, results: Array<{title: string; url: string; snippet: string}>): string {
  if (results.length === 0) return ''

  let context = `【联网搜索结果】\n搜索词: "${query}"\n\n`
  results.forEach((r, i) => {
    context += `${i + 1}. ${r.title}\n`
    context += `   链接: ${r.url}\n`
    context += `   摘要: ${r.snippet}\n\n`
  })
  context += '--- 请基于以上搜索结果回答用户问题 ---\n'

  return context
}
