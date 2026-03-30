import type { ReactNode } from 'react'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F0F7FF',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {children}
    </div>
  )
}
