const THEME_KEY = 'charweaver-theme'

export type ThemeMode = 'light' | 'dark' | 'system'

// 获取保存的主题偏好
export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem(THEME_KEY) as ThemeMode) || 'system'
}

// 保存主题偏好
export function storeTheme(mode: ThemeMode) {
  localStorage.setItem(THEME_KEY, mode)
}

// 根据模式和系统偏好决定是否启用 dark
export function shouldBeDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// 应用主题到 <html>
export function applyTheme(mode: ThemeMode) {
  const dark = shouldBeDark(mode)
  document.documentElement.classList.toggle('dark', dark)
}

// 设置主题（保存 + 应用）
export function setTheme(mode: ThemeMode) {
  storeTheme(mode)
  applyTheme(mode)
}

// 监听系统主题变化（仅在 system 模式下生效）
export function listenSystemTheme(mode: ThemeMode) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    if (getStoredTheme() === 'system') {
      applyTheme('system')
    }
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
