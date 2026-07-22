import React from 'react'
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

  // 4. Coach profile — fetched to drive the onboarding-completeness redirect,
  // which now runs CLIENT-SIDE in CoachLayoutClient (Fix-LAYOUT-02). A
  // server-side redirect() here was cached in the production RSC payload and
  // looped (Fix-LAYOUT-01 patched the wrong branch). UX redirect only — role
  // (gate 3) and terms (gate 5) stay server-side; API routes use
  // requireCoachContext.
  // BUG-34: display_name (set by wizard step 1) is the nudge signal — NOT
  // is_profile_live, which only turns true at the final go-live step and
  // force-bounced every returning not-yet-live coach back into the wizard.
  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('id, display_name')
    .eq('user_profile_id', userProfile.id)
    .single()

  // 5. Accepted terms? Must be done before any protected surface.
  if (!userProfile.terms_accepted_at) redirect('/onboarding/terms')

  // All guards passed — render the coach chrome.
  // BUG-37: the chrome shows the coach's public display_name (product rule:
  // display_name everywhere a coach is visible; full_name only in Settings).
  // Falls back to full_name for coaches who haven't run wizard step 1 yet.
  // `||` (not `??`) on purpose: internal chrome must never show a blank name,
  // unlike the public routes where '' is now rejected at write time.
  return (
    <CoachLayoutClient
      initialCoachName={coachProfile?.display_name || userProfile.full_name || ''}
      initialAvatarUrl={userProfile.avatar_url || null}
      hasCoachProfile={!!coachProfile}
      hasWizardProgress={!!coachProfile?.display_name}
    >
      {children}
    </CoachLayoutClient>
  )
}
