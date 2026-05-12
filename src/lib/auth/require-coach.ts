// AF-P-04: shared coach-route auth gate.
//
// Replaces the 3–4 sequential awaits at the top of every authenticated
// coach API route with a single helper call. Variant B parallelises
// user_roles + coach_profiles SELECT (saves one round-trip). Variants
// A and C remain sequential to preserve existing semantics:
//   - A keeps role-only gate so callers can do their own coach_profiles
//     work (deferred-upsert paths). profile/route.ts GET migrated to
//     Variant B in PERF-01-FIX — accepts the redundant coach_profiles
//     ID check for the parallelisation win.
//   - C upserts coach_profiles only after role passes — prevents orphan
//     rows for non-coach users (matches current behaviour).
//
// Error responses match the existing routes (em-dash
// 'Forbidden — coach role required' standardised across all 25 routes).

import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type CoachRoleContext = {
  user: User
  userProfile: { id: string }
}

export type CoachContext = CoachRoleContext & {
  coachProfile: { id: string }
}

type Result<T> =
  | { context: T; error: null }
  | { context: null; error: NextResponse<{ error: string }> }

// Variant A — gate only (auth + user_profiles + user_roles).
// Used by routes that need to do their own coach_profiles work
// (e.g. richer SELECT, deferred upsert).
export async function requireCoachRole(
  supabase: SupabaseServerClient,
): Promise<Result<CoachRoleContext>> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { context: null, error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  }

  const { data: userProfile, error: upError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (upError || !userProfile) {
    return { context: null, error: NextResponse.json({ error: 'User profile not found' }, { status: 404 }) }
  }

  const { data: roleRow, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_profile_id', userProfile.id)
    .eq('role', 'coach')
    .single()
  if (roleError || !roleRow) {
    return { context: null, error: NextResponse.json({ error: 'Forbidden — coach role required' }, { status: 403 }) }
  }

  return { context: { user, userProfile }, error: null }
}

// Variant B — full context with coach_profiles SELECT gate.
// Parallelises user_roles + coach_profiles after user_profiles.
// 404 if coach_profiles row doesn't exist.
export async function requireCoachContext(
  supabase: SupabaseServerClient,
): Promise<Result<CoachContext>> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { context: null, error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  }

  const { data: userProfile, error: upError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (upError || !userProfile) {
    return { context: null, error: NextResponse.json({ error: 'User profile not found' }, { status: 404 }) }
  }

  // Parallel: role + coach_profiles. Both keyed on userProfile.id, independent.
  const [roleResult, coachResult] = await Promise.all([
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_profile_id', userProfile.id)
      .eq('role', 'coach')
      .single(),
    supabase
      .from('coach_profiles')
      .select('id')
      .eq('user_profile_id', userProfile.id)
      .single(),
  ])

  if (roleResult.error || !roleResult.data) {
    return { context: null, error: NextResponse.json({ error: 'Forbidden — coach role required' }, { status: 403 }) }
  }
  if (coachResult.error || !coachResult.data) {
    return { context: null, error: NextResponse.json({ error: 'Coach profile not found' }, { status: 404 }) }
  }

  return { context: { user, userProfile, coachProfile: coachResult.data }, error: null }
}

// Variant C — full context with coach_profiles UPSERT.
// Sequential (4 await rounds) to avoid creating orphan coach_profiles
// rows for non-coach users. Matches current behaviour in
// availability/route.ts and blocked-dates/route.ts (Fix-CD-04b).
export async function requireCoachContextOrCreate(
  supabase: SupabaseServerClient,
): Promise<Result<CoachContext>> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { context: null, error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  }

  const { data: userProfile, error: upError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (upError || !userProfile) {
    return { context: null, error: NextResponse.json({ error: 'User profile not found' }, { status: 404 }) }
  }

  const { data: roleRow, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_profile_id', userProfile.id)
    .eq('role', 'coach')
    .single()
  if (roleError || !roleRow) {
    return { context: null, error: NextResponse.json({ error: 'Forbidden — coach role required' }, { status: 403 }) }
  }

  const { data: coachProfile, error: coachError } = await supabase
    .from('coach_profiles')
    .upsert(
      { user_profile_id: userProfile.id, updated_at: new Date().toISOString() },
      { onConflict: 'user_profile_id', ignoreDuplicates: false },
    )
    .select('id')
    .single()
  if (coachError || !coachProfile) {
    console.error('[requireCoachContextOrCreate] coach_profiles upsert error:', coachError)
    return { context: null, error: NextResponse.json({ error: 'Failed to create coach profile' }, { status: 500 }) }
  }

  return { context: { user, userProfile, coachProfile }, error: null }
}
