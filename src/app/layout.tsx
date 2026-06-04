import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

// Injected into <head> so styles apply after Google Maps async style injection.
// Cannot live in globals.css because Google appends .pac-container outside the
// Next.js root div and its own <style> tag loads after ours.
const pacStyles = `
  .pac-container {
    border: 1px solid #e2e8f0 !important;
    border-radius: 12px !important;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important;
    margin-top: 4px !important;
    font-family: 'DM Sans', sans-serif !important;
    overflow: hidden;
  }
  .pac-item {
    padding: 10px 16px !important;
    font-size: 14px !important;
    color: #1e293b !important;
    cursor: pointer !important;
    border-top: 1px solid #f1f5f9 !important;
  }
  .pac-item:first-child { border-top: none !important; }
  .pac-item:hover, .pac-item-selected { background-color: #f0f7ff !important; }
  .pac-item-query { font-size: 14px !important; color: #0f172a !important; font-weight: 600 !important; }
  .pac-matched { font-weight: 700 !important; color: #0077cc !important; }
  .pac-icon { display: none !important; }
`

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
  icons: {
    icon: '/icon.jpeg',
    apple: '/icon.jpeg',
  },
  openGraph: {
    images: ['/icon.jpeg'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${dmSans.variable} scroll-smooth scroll-pt-[72px]`}>
      <head>
        <meta name="color-scheme" content="light" />
        <meta name="theme-color" content="#FFFFFF" />
        {/* eslint-disable-next-line react/no-danger */}
        <style dangerouslySetInnerHTML={{ __html: pacStyles }} />
      </head>
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
