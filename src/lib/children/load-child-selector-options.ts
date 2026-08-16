// P-10 (single-flow rev): server-side assembly of a parent's children as
// ChildSelector options — shared by the auth-aware availability page and,
// later, the P-13 checkout. Extracted from the retired /parent/book page.
//
// COPPA rule (docs/06, parent-module convention): child data is fetched
// server-side ONLY, with the RLS-respecting server client, scoped to the
// authenticated user via user_profiles → parent_profiles → child_profiles.
// Failures degrade to [] with a server-side error log — never silent, never
// client-fetched.

import { createClient } from '@/lib/supabase/server'
import { ageFromDateOfBirth } from '@/lib/children/child-api'
import { childIdentityColour, firstNameOf } from '@/constants/childIdentity'
import type { ChildSelectorOption } from '@/components/parent/children/ChildSelector'

/**
 * The signed-in user's children as ChildSelector options, or null when the
 * user is not a parent (no auth, no profile, or no parent_profiles row) —
 * null tells the caller to render the guest experience. A parent with zero
 * children returns [] (authed experience with an empty selector).
 */
export async function loadChildSelectorOptions(): Promise<ChildSelectorOption[] | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!userProfile) return null

    const { data: parentProfile } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('user_profile_id', userProfile.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!parentProfile) return null

    const { data: childRows, error } = await supabase
      .from('child_profiles')
      .select('id, full_name, date_of_birth')
      .eq('parent_profile_id', parentProfile.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[loadChildSelectorOptions] child_profiles lookup failed:', error)
      return []
    }

    return (childRows ?? []).map(
      (child, index): ChildSelectorOption => ({
        id: child.id,
        firstName: firstNameOf(child.full_name),
        colour: childIdentityColour(index),
        age: ageFromDateOfBirth(child.date_of_birth),
      }),
    )
  } catch (error) {
    console.error('[loadChildSelectorOptions] children fetch failed:', error)
    return null
  }
}
