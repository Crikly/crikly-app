import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCoachContext } from '@/lib/auth/require-coach'

interface EnrolmentItem {
  id: string
  child_name: string | null
  child_dob: string | null
  parent_name: string
  payment_type: string
  joined_at_session_number: number
  status: string
  created_at: string
}

interface RosterResponse {
  programme_id: string
  programme_title: string
  total_spots: number
  enrolled_count: number
  enrolments: EnrolmentItem[]
}

/**
 * GET /api/coaches/programmes/[programmeId]/roster
 *
 * Returns the enrolled participant list for a programme.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> }
): Promise<NextResponse<RosterResponse | { error: string }>> {
  try {
    const { programmeId } = await params
    const supabase = await createClient()

    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify programme ownership
    const adminSupabase = createAdminClient()
    const { data: programme, error: progError } = await adminSupabase
      .from('group_programmes')
      .select('id, title, max_spots, current_spots')
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .single()
    if (progError || !programme) {
      return NextResponse.json({ error: 'Programme not found or access denied' }, { status: 404 })
    }

    // 5. Fetch active enrolments
    const { data: enrolments, error: enrolError } = await adminSupabase
      .from('group_programme_enrolments')
      .select('id, child_profile_id, booked_by_user_id, payment_type, joined_at_session_number, status, participant_name, cancellation_reason, created_at')
      .eq('programme_id', programmeId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
    if (enrolError) {
      console.error('[GET /roster] enrolments fetch error:', enrolError)
      return NextResponse.json({ error: 'Failed to fetch roster' }, { status: 500 })
    }

    const rows = enrolments || []

    // 6. Batch-fetch child profiles (Fix-16d: no nested joins)
    const childIds = [
      ...new Set(rows.map(e => e.child_profile_id).filter((id): id is string => id !== null)),
    ]
    const childMap: Record<string, { full_name: string; date_of_birth: string }> = {}
    if (childIds.length > 0) {
      const { data: children } = await adminSupabase
        .from('child_profiles')
        .select('id, full_name, date_of_birth')
        .in('id', childIds)
      children?.forEach(c => {
        childMap[c.id] = { full_name: c.full_name, date_of_birth: c.date_of_birth }
      })
    }

    // 7. Batch-fetch user profiles for parent names
    const userIds = [
      ...new Set(rows.map(e => e.booked_by_user_id).filter((id): id is string => !!id)),
    ]
    const userMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', userIds)
      users?.forEach(u => { userMap[u.id] = u.full_name })
    }

    // 8. Build response items
    const enrolmentItems: EnrolmentItem[] = rows.map(e => {
      const isOffline = e.payment_type === 'offline'
      const child = e.child_profile_id ? childMap[e.child_profile_id] : null

      // participant_name is the canonical column (migration 020).
      // Fall back to cancellation_reason for rows that predate the migration.
      const childName = child
        ? child.full_name
        : isOffline
          ? (e.participant_name ?? (e.cancellation_reason?.split('\n')[0] ?? null))
          : null

      return {
        id: e.id,
        child_name: childName,
        child_dob: child ? child.date_of_birth : null,
        parent_name: isOffline ? 'Added manually' : (userMap[e.booked_by_user_id] || ''),
        payment_type: e.payment_type,
        joined_at_session_number: e.joined_at_session_number,
        status: e.status,
        created_at: e.created_at,
      }
    })

    const response: RosterResponse = {
      programme_id: programme.id,
      programme_title: programme.title,
      total_spots: programme.max_spots,
      enrolled_count: programme.current_spots,
      enrolments: enrolmentItems,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/programmes/[programmeId]/roster]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/programmes/[programmeId]/roster
 *
 * Manually add an offline participant to a programme (REQ-C-061).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> }
): Promise<NextResponse<{ enrolment: EnrolmentItem } | { error: string }>> {
  try {
    const { programmeId } = await params
    const supabase = await createClient()

    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { userProfile, coachProfile } = context

    // 4. Verify programme ownership + check it can accept participants
    const adminSupabase = createAdminClient()
    const { data: programme, error: progError } = await adminSupabase
      .from('group_programmes')
      .select('id, max_spots, current_spots, status')
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .single()
    if (progError || !programme) {
      return NextResponse.json({ error: 'Programme not found or access denied' }, { status: 404 })
    }

    if (programme.status === 'cancelled' || programme.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot add participants to a cancelled or completed programme' },
        { status: 400 }
      )
    }

    if (programme.current_spots >= programme.max_spots) {
      return NextResponse.json({ error: 'Programme is full' }, { status: 400 })
    }

    // 5. Parse and validate body
    const body = await request.json()
    if (!body.child_name || typeof body.child_name !== 'string' || !body.child_name.trim()) {
      return NextResponse.json({ error: 'child_name is required' }, { status: 400 })
    }

    const childName = body.child_name.trim()
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null

    // 6. Insert enrolment — participant_name is the canonical column (migration 020).
    //    notes stored in cancellation_reason (its proper purpose once name moves out).
    const { data: newEnrolment, error: insertError } = await adminSupabase
      .from('group_programme_enrolments')
      .insert({
        programme_id: programmeId,
        booked_by_user_id: userProfile.id,
        child_profile_id: null,
        payment_type: 'offline',
        payment_model: 'per_session',
        status: 'active',
        joined_at_session_number: 1,
        participant_name: childName,
        cancellation_reason: notes || null,
      })
      .select('id, created_at')
      .single()

    if (insertError || !newEnrolment) {
      console.error('[POST /roster] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to add participant' }, { status: 500 })
    }

    // 7. Increment current_spots
    const { error: updateError } = await adminSupabase
      .from('group_programmes')
      .update({ current_spots: programme.current_spots + 1 })
      .eq('id', programmeId)
    if (updateError) {
      // Non-fatal — enrolment already created; log and continue
      console.error('[POST /roster] current_spots increment error:', updateError)
    }

    const enrolmentItem: EnrolmentItem = {
      id: newEnrolment.id,
      child_name: childName,
      child_dob: null,
      parent_name: 'Added manually',
      payment_type: 'offline',
      joined_at_session_number: 1,
      status: 'active',
      created_at: newEnrolment.created_at,
    }

    return NextResponse.json({ enrolment: enrolmentItem }, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/programmes/[programmeId]/roster]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
