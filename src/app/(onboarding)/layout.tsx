import type { ReactNode } from 'react'

// AUTH-JOURNEY-01: the role + terms pages now render AuthSplitShell directly
// (full-viewport split-screen), so this group layout is a pass-through — it
// must NOT re-wrap children in a centered card or it would nest inside the
// shell and break the layout. DM Sans inherits from globals.css.
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-white">{children}</main>
}
