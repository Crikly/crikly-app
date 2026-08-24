import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  requireParentRole,
  requireParentContextOrCreate,
} from '@/lib/auth/require-parent'
import {
  CHILD_SELECT,
  serializeChild,
  validateChildWrite,
  verifyActiveSports,
  type ChildResponse,
  type ChildRowWithSports,
} from '@/lib/children/child-api'

/**
 * GET /api/children
 *
 * The authenticated parent's children (soft-deleted excluded), ordered by
 * created_at ascending — the order the identity-colour palette is derived
 * from (src/constants/childIdentity.ts, colour by child index).
 * A parent with no parent_profiles row yet has no children: empty list.
 */
export async function GET(): Promise<NextResponse<{ children: ChildResponse[] } | { error: string }>> {
  try {
    const supabase = await createClient()

    const { context, error } = await requireParentRole(supabase)
    if (error) return error

    const { data: parentProfile, error: ppError } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('user_profile_id', context.userProfile.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (ppError) {
      console.error('[GET /api/children] parent_profiles read error:', ppError)
      return NextResponse.json({ error: 'Failed to load children' }, { status: 500 })
    }
    if (!parentProfile) {
      return NextResponse.json({ children: [] }, { status: 200 })
    }

    const { data: rows, error: childError } = await supabase
      .from('child_profiles')
      .select(CHILD_SELECT)
      .eq('parent_profile_id', parentProfile.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (childError) {
      console.error('[GET /api/children] child_profiles read error:', childError)
      return NextResponse.json({ error: 'Failed to load children' }, { status: 500 })
    }

    const children = ((rows ?? []) as unknown as ChildRowWithSports[]).map(serializeChild)
    return NextResponse.json({ children }, { status: 200 })
  } catch (error) {
    console.error('[GET /api/children]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/children
 *
 * Creates a child profile plus its child_sports rows. Creates the parent's
 * parent_profiles row lazily on first child (REQ-P-005). supabase-js has no
 * transactions, so a failed child_sports insert rolls back the child row
 * best-effort — a child is never left half-created with silent missing sports.
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<ChildResponse | { error: string; details?: string[] }>> {
  try {
    const supabase = await createClient()

    const { context, error } = await requireParentContextOrCreate(supabase)
    if (error) return error
    const { parentProfile } = context

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { input, errors } = validateChildWrite(body, 'create')
    if (errors) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }
    const sports = input.sports ?? []

    const sportsValid = await verifyActiveSports(supabase, sports)
    if (!sportsValid) {
      return NextResponse.json(
        { error: 'Validation failed', details: ['one or more sports are not available'] },
        { status: 400 },
      )
    }

    const { data: child, error: insertError } = await supabase
      .from('child_profiles')
      .insert({
        parent_profile_id: parentProfile.id,
        full_name: input.childFields.full_name ?? '',
        date_of_birth: input.childFields.date_of_birth ?? '',
        gender: input.childFields.gender ?? null,
        medical_notes: input.childFields.medical_notes ?? null,
      })
      .select('id')
      .single()
    if (insertError || !child) {
      console.error('[POST /api/children] child_profiles insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create child profile' }, { status: 500 })
    }

    if (sports.length > 0) {
      const { error: sportsError } = await supabase.from('child_sports').insert(
        sports.map((sport) => ({
          child_profile_id: child.id,
          sport_id: sport.sport_id,
          skill_level: sport.skill_level,
        })),
      )
      if (sportsError) {
        console.error('[POST /api/children] child_sports insert error:', sportsError)
        // Best-effort rollback (no transactions via supabase-js) via SOFT
        // delete — the platform's never-hard-DELETE rule applies even to a
        // same-request rollback (guest bookings + programme enrolments set
        // this precedent in docs/04_API_REFERENCE.md).
        const { error: rollbackError } = await supabase
          .from('child_profiles')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', child.id)
        if (rollbackError) {
          console.error('[POST /api/children] rollback delete error:', rollbackError)
        }
        return NextResponse.json({ error: 'Failed to save sports for child' }, { status: 500 })
      }
    }

    const { data: created, error: fetchError } = await supabase
      .from('child_profiles')
      .select(CHILD_SELECT)
      .eq('id', child.id)
      .single()
    if (fetchError || !created) {
      console.error('[POST /api/children] re-fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch created child' }, { status: 500 })
    }

    return NextResponse.json(serializeChild(created as unknown as ChildRowWithSports), {
      status: 201,
    })
  } catch (error) {
    console.error('[POST /api/children]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
