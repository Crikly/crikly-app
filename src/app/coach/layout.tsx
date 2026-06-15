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

  // 4. Coach onboarding gates. pathname comes from the x-pathname header set in
  // proxy.ts; we skip these redirects when already inside /coach/onboarding/*
  // (the destinations are wrapped by this layout — redirecting unconditionally
  // caused ERR_TOO_MANY_REDIRECTS, Fix-AUDIT-02).
  const pathname = (await headers()).get('x-pathname')
  const inCoachOnboarding = !pathname ||
    pathname.startsWith('/coach/onboarding')

  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('id, is_profile_live')
    .eq('user_profile_id', userProfile.id)
    .single()

  // Fix-LAYOUT-DIAG (TEMPORARY — remove immediately after the staging trace is
  // captured): logs the gate inputs on every render, before the redirect gates,
  // to confirm the x-pathname / inCoachOnboarding values seen on RSC re-renders.
  console.log('[CoachLayout-DIAG]', {
    pathname,
    inCoachOnboarding,
    isProfileLive: coachProfile?.is_profile_live ?? 'no-row',
    termsAccepted: !!userProfile.terms_accepted_at,
  })

  // 4a. No coach_profile row → onboarding never started → first step.
  // Fix-AUTH-ONBOARD-01 (State D): the first step is /profile (personal info),
  // not /sport — the previous target skipped step 1.
  if (!coachProfile && !inCoachOnboarding) {
    redirect('/coach/onboarding/profile')
  }

  // 4b. coach_profile exists but is_profile_live = false → onboarding started
  // but not completed → resume from step 1 (every step pre-populates from saved
  // data). Fix-AUTH-ONBOARD-01 (State E): without this an incomplete coach could
  // reach /coach/dashboard. is_profile_live is the only column-level "complete"
  // signal; exact-step resume would need a new column (out of scope).
  if (coachProfile && !coachProfile.is_profile_live && !inCoachOnboarding) {
    redirect('/coach/onboarding/profile')
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
