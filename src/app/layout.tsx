import type { Metadata } from 'next'
import { Kanit, Zen_Kaku_Gothic_New } from 'next/font/google'
import './globals.css'

const bodyFont = Zen_Kaku_Gothic_New({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-body',
})

const displayFont = Kanit({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: '豊洲駅発 - 都バス混雑比較',
  description: '豊洲駅から枝川・塩浜方面へ向かうバスの到着情報と混雑状況をリアルタイムで表示します。',
  viewport: 'width=device-width, initial-scale=1',
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
