// Public marketing layout — no auth checks, no sidebar.
// MarketingNav and footer are stubs until MS-13.
import type { ReactNode } from 'react'

function MarketingNav() {
  // STUB: replaced in MS-13
  return (
    <nav className="h-14 border-b border-gray-100 flex items-center px-6">
      <span className="text-lg font-bold tracking-tight">
        crik<span className="text-[#0077CC]">ly</span>
      </span>
    </nav>
  )
}

function MarketingFooter() {
  // STUB: replaced in MS-13
  return (
    <footer className="border-t border-gray-100 py-6 px-6 text-center text-xs text-gray-400">
      © 2026 Crikly · crikly.app
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
