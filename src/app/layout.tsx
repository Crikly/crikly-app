import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  style: ['normal', 'italic'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Crikly',
  description: 'Sports Coaching Marketplace',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body
        className={dmSans.className}
        style={{ 
          fontFamily: 'DM Sans, sans-serif',
          backgroundColor: '#ffffff',
        }}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  )
}
