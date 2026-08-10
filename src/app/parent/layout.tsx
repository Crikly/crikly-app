import React from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/shell/AppShell'
import { isShellRole } from '@/components/shell/roles'

// P-04-A: server-side auth guard for /parent/*. Mirrors the proven
// coach/layout.tsx gate order (session → profile → role → terms) with the
// role gate widened to parent OR player: a player active_role landing
// here must not loop back to /dashboard (the dashboard router sends both
// roles to /parent/dashboard). The middleware (src/proxy.ts) already
// bounces unauthenticated requests, but the gates repeat here so a direct
// RSC render can never leak the parent chrome.
//
// P-04-C: ParentNav retired — the unified AppShell bar carries the logo,
// role pill, "Find a coach" + "My bookings" links AND the avatar (approved
// design, screens 01-B + 04). One 64px bar, nothing stacked under it.

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // 1. Authenticated?
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 2. user_profile exists? Chrome fields folded into this query.
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('id, full_name, avatar_url, terms_accepted_at, active_role')
    .eq('auth_user_id', user.id)
    .single()
  if (!userProfile) redirect('/login')

  // 3. Holds a parent or player role? One query also feeds the role pill.
  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_profile_id', userProfile.id)
  const roles = (roleRows ?? []).map((row) => row.role).filter(isShellRole)
  if (!roles.includes('parent') && !roles.includes('player')) {
    redirect('/dashboard')
  }

  // 4. Accepted terms? Must be done before any protected surface.
  if (!userProfile.terms_accepted_at) redirect('/onboarding/terms')

  // Pill shows the module context: parent, or player for a player
  // active_role (both live in this module — see the dashboard router).
  const activeRole =
    userProfile.active_role === 'player' ? 'player' : 'parent'

  return (
    <div className="min-h-screen bg-white font-sans">
      <AppShell
        context="parent"
        className="sticky top-0 z-40"
        name={userProfile.full_name || ''}
        email={user.email ?? ''}
        avatarUrl={userProfile.avatar_url ?? null}
        activeRole={activeRole}
        roles={roles}
      />
      {children}
    </div>
  )
}
