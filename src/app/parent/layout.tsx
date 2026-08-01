import React from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ParentNav } from '@/components/parent/ParentNav'

// P-04-A: server-side auth guard for /parent/*. Mirrors the proven
// coach/layout.tsx gate order (session → profile → role → terms) with the
// role gate widened to parent OR player: a player active_role landing
// here must not loop back to /dashboard (the dashboard router sends both
// roles to /parent/dashboard). The middleware (src/proxy.ts) already
// bounces unauthenticated requests, but the gates repeat here so a direct
// RSC render can never leak the parent chrome.

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
    .select('id, full_name, avatar_url, terms_accepted_at')
    .eq('auth_user_id', user.id)
    .single()
  if (!userProfile) redirect('/login')

  // 3. Holds a parent or player role? One query also answers whether the
  // popover shows "Switch to Coach".
  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_profile_id', userProfile.id)
  const roles = (roleRows ?? []).map((row) => row.role)
  if (!roles.includes('parent') && !roles.includes('player')) {
    redirect('/dashboard')
  }

  // 4. Accepted terms? Must be done before any protected surface.
  if (!userProfile.terms_accepted_at) redirect('/onboarding/terms')

  return (
    <div className="min-h-screen bg-white font-sans">
      <ParentNav
        name={userProfile.full_name || ''}
        email={user.email ?? ''}
        avatarUrl={userProfile.avatar_url ?? null}
        hasCoachRole={roles.includes('coach')}
      />
      {children}
    </div>
  )
}
