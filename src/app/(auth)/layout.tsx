import type { ReactNode } from 'react'

// PUB-03: each auth page declares its own shell (AuthSplitShell for login +
// register, AuthCenteredShell for forgot-password). This layout owns only
// page-level chrome — min-height and base background. DM Sans inherits
// from globals.css.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-white">{children}</main>
}
