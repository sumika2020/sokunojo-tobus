import type { Metadata, Viewport } from 'next'
import { Orbitron, Zen_Kaku_Gothic_New } from 'next/font/google'
import './globals.css'

const bodyFont = Zen_Kaku_Gothic_New({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-body',
})

const displayFont = Orbitron({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: '即乗都バス',
  description: '豊洲駅から枝川・塩浜方面へ向かうバスの到着情報と混雑状況をリアルタイムで表示します。',
  icons: {
    icon: '/icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className={`${bodyFont.variable} ${displayFont.variable} app-shell`}>
        {children}
      </body>
    </html>
  )
}
