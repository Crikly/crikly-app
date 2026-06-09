import React from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CoachLayoutClient } from '@/components/coach/CoachLayoutClient'

// AUTH-FIX-01 (FIX A): server-side role + state guard for /coach/*. The
// previous layout silently caught errors and rendered the coach chrome
// regardless of role — a parent could navigate to /coach/dashboard and
// see an empty coach UI shell. Now every disallowed state redirects to
// the right next step. Mirrors the gates `requireCoachContext` enforces
// at the API layer (src/lib/auth/require-coach.ts:72) but uses
// redirect() for page-level routing instead of NextResponse.

export default async function CoachLayout({
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

  // 2. user_profile exists? Fold chrome lookup (full_name + avatar_url)
  // and the terms gate read into this query so the layout makes three
  // DB round-trips at most.
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('id, full_name, avatar_url, terms_accepted_at')
    .eq('auth_user_id', user.id)
    .single()
  if (!userProfile) redirect('/login')

  // 3. Has coach role? Parents/players bounce to /dashboard.
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_profile_id', userProfile.id)
    .eq('role', 'coach')
    .single()
  if (!roleRow) redirect('/dashboard')

  // 4. Has coach_profile? Coach role but no profile row means coach
  // onboarding hasn't started — send them to step 1. BUT skip this redirect
  // when already inside /coach/onboarding/* (the destination is itself wrapped
  // by this layout, so redirecting unconditionally caused ERR_TOO_MANY_REDIRECTS
  // — Fix-AUDIT-02). pathname comes from the x-pathname header set in proxy.ts.
  const pathname = (await headers()).get('x-pathname') ?? ''
  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('id')
    .eq('user_profile_id', userProfile.id)
    .single()
  if (!coachProfile && !pathname.startsWith('/coach/onboarding')) {
    redirect('/coach/onboarding/sport')
  }

  // 5. Accepted terms? Must be done before any protected surface.
  if (!userProfile.terms_accepted_at) redirect('/onboarding/terms')

  // All guards passed — render the coach chrome.
  return (
    <CoachLayoutClient
      initialCoachName={userProfile.full_name || ''}
      initialAvatarUrl={userProfile.avatar_url || null}
    >
      {children}
    </CoachLayoutClient>
  )
}
