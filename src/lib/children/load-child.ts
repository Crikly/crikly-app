// P-07: server-side data assembly shared by the child profile card and
// edit pages. Child data is fetched server-side only (COPPA rule — same
// precedent as parent/dashboard/page.tsx) through the RLS-scoped client;
// RLS plus the parent_profiles join chain keeps it to the caller's own
// children. Returns null when the child doesn't exist or isn't theirs —
// pages turn that into notFound().

import { createClient } from '@/lib/supabase/server'
import { ageFromDateOfBirth } from '@/lib/children/child-api'
import { childIdentityColour, firstNameOf } from '@/constants/childIdentity'

// Supabase nested joins come back object-or-array depending on inferred
// cardinality (same normalisation as parent/dashboard/page.tsx).
function firstOf<T>(value: T | T[] | null): T | null {
  if (value === null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export interface OwnedChild {
  id: string
  fullName: string
  firstName: string
  dateOfBirth: string
  age: number
  /** Index among the parent's children (created_at asc) — colour order. */
  index: number
  colour: string
  gender: string | null
  medicalNotes: string | null
  sportId: string | null
  sportName: string | null
  sportSlug: string | null
  skillLevel: string | null
}

interface ChildRow {
  id: string
  full_name: string
  date_of_birth: string
  gender: string | null
  medical_notes: string | null
  child_sports: Array<{
    sport_id: string
    skill_level: string
    sports: { name: string; slug: string } | { name: string; slug: string }[] | null
  }> | null
}

/**
 * The authenticated parent's children (created_at asc). Empty when the
 * user is missing, holds no parent profile, or a read fails (server-logged).
 */
export async function loadOwnedChildren(): Promise<OwnedChild[]> {
  const supabase = await createClient()

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!userProfile) return []

    const { data: parentProfile } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('user_profile_id', userProfile.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!parentProfile) return []

    const { data: rows, error } = await supabase
      .from('child_profiles')
      .select(
        `
        id,
        full_name,
        date_of_birth,
        gender,
        medical_notes,
        child_sports (
          sport_id,
          skill_level,
          sports ( name, slug )
        )
      `,
      )
      .eq('parent_profile_id', parentProfile.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[loadOwnedChildren] child_profiles read error:', error)
      return []
    }

    return ((rows ?? []) as ChildRow[]).map((row, index) => {
      // Single sport in v1 (approved design); the schema supports more.
      const sport = row.child_sports?.[0] ?? null
      return {
        id: row.id,
        fullName: row.full_name,
        firstName: firstNameOf(row.full_name),
        dateOfBirth: row.date_of_birth,
        age: ageFromDateOfBirth(row.date_of_birth),
        index,
        colour: childIdentityColour(index),
        gender: row.gender,
        medicalNotes: row.medical_notes,
        sportId: sport?.sport_id ?? null,
        sportName: sport ? (firstOf(sport.sports)?.name ?? null) : null,
        sportSlug: sport ? (firstOf(sport.sports)?.slug ?? null) : null,
        skillLevel: sport?.skill_level ?? null,
      }
    })
  } catch (error) {
    console.error('[loadOwnedChildren]', error)
    return []
  }
}

export async function loadOwnedChild(childId: string): Promise<OwnedChild | null> {
  const children = await loadOwnedChildren()
  return children.find((child) => child.id === childId) ?? null
}

/** Active sports for the form pills (name asc). */
export async function loadActiveSports(): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sports')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) {
    console.error('[loadActiveSports] sports read error:', error)
    return []
  }
  return data ?? []
}
