// Funnel layout — full viewport, no nav, no footer.
// Used for role splash (MS-10) and video screens (MS-11).
import type { ReactNode } from 'react'

export default function FunnelLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen w-full">{children}</div>
}
