import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CharWeaver - 多模型AI助手',
  description: '支持多角色、多模型、多会话的AI助手应用',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var theme = localStorage.getItem('charweaver-theme') || 'system';
                var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (dark) document.documentElement.classList.add('dark');
              })();
            `
          }}
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
