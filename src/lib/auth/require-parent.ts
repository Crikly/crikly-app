// P-07: shared parent-route auth gate, mirroring require-coach.ts.
//
// Three variants, matching how the child-profile routes consume them:
//   - requireParentRole      → gate only (auth + user_profiles + user_roles).
//     GET /api/children uses this so a parent with no parent_profiles row
//     yet reads an empty list instead of a 404 (dashboard precedent).
//   - requireParentContext   → + parent_profiles SELECT, 404 when missing.
//     Used by /api/children/[id] — if the parent has no profile row they
//     cannot own the child, so 404 is correct.
//   - requireParentContextOrCreate → + lazy parent_profiles creation.
//     POST /api/children creates the row on first child (REQ-P-005: the
//     first child profile is collected lazily in-context — nothing else
//     creates parent_profiles). Select-then-insert because the table has
//     no unique index on user_profile_id for an upsert to conflict on;
//     the role gate runs first so non-parents can never create orphan rows.

import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type ParentRoleContext = {
  user: User
  userProfile: { id: string }
}

export type ParentContext = ParentRoleContext & {
  parentProfile: { id: string }
}

type Result<T> =
  | { context: T; error: null }
  | { context: null; error: NextResponse<{ error: string }> }

export async function requireParentRole(
  supabase: SupabaseServerClient,
): Promise<Result<ParentRoleContext>> {
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
    .eq('role', 'parent')
    .single()
  if (roleError || !roleRow) {
    return { context: null, error: NextResponse.json({ error: 'Forbidden — parent role required' }, { status: 403 }) }
  }

  return { context: { user, userProfile }, error: null }
}

export async function requireParentContext(
  supabase: SupabaseServerClient,
): Promise<Result<ParentContext>> {
  const { context, error } = await requireParentRole(supabase)
  if (error) return { context: null, error }

  const { data: parentProfile, error: ppError } = await supabase
    .from('parent_profiles')
    .select('id')
    .eq('user_profile_id', context.userProfile.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (ppError) {
    console.error('[requireParentContext] parent_profiles read error:', ppError)
    return { context: null, error: NextResponse.json({ error: 'Failed to load parent profile' }, { status: 500 }) }
  }
  if (!parentProfile) {
    return { context: null, error: NextResponse.json({ error: 'Parent profile not found' }, { status: 404 }) }
  }

  return { context: { ...context, parentProfile }, error: null }
}

export async function requireParentContextOrCreate(
  supabase: SupabaseServerClient,
): Promise<Result<ParentContext>> {
  const { context, error } = await requireParentRole(supabase)
  if (error) return { context: null, error }

  const { data: existing, error: readError } = await supabase
    .from('parent_profiles')
    .select('id')
    .eq('user_profile_id', context.userProfile.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (readError) {
    console.error('[requireParentContextOrCreate] parent_profiles read error:', readError)
    return { context: null, error: NextResponse.json({ error: 'Failed to load parent profile' }, { status: 500 }) }
  }
  if (existing) {
    return { context: { ...context, parentProfile: existing }, error: null }
  }

  const { data: created, error: insertError } = await supabase
    .from('parent_profiles')
    .insert({ user_profile_id: context.userProfile.id })
    .select('id')
    .single()
  if (insertError || !created) {
    console.error('[requireParentContextOrCreate] parent_profiles insert error:', insertError)
    return { context: null, error: NextResponse.json({ error: 'Failed to create parent profile' }, { status: 500 }) }
  }

  return { context: { ...context, parentProfile: created }, error: null }
}
