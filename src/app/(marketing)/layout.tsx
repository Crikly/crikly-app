import type { ReactNode } from 'react'
import { MarketingNav } from '@/components/marketing/MarketingNav'

function MarketingFooter() {
  return (
    <footer
      className="flex flex-col md:flex-row justify-between items-center"
      style={{
        padding: '32px 40px',
        borderTop: '1px solid #F1F5F9',
        color: '#94A3B8',
        fontSize: '12px',
        gap: '12px',
      }}
    >
      <span>© 2026 Crikly · crikly.app</span>
      <div className="flex" style={{ gap: '20px' }}>
        {['Privacy', 'Terms', 'Contact'].map(link => (
          <a
            key={link}
            href="#"
            style={{ color: '#94A3B8', textDecoration: 'none' }}
          >
            {link}
          </a>
        ))}
      </div>
    </footer>
  )
}

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  )
}
