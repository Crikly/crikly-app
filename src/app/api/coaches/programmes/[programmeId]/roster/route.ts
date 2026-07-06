import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCoachContext } from '@/lib/auth/require-coach'
import { expandSessionBlocks, slotDisplayName } from '@/lib/availability/campSlots'

interface EnrolmentItem {
  id: string
  child_name: string | null
  child_dob: string | null
  parent_name: string
  payment_type: string
  joined_at_session_number: number
  status: string
  created_at: string
  /**
   * BUG-23: which sessions/slots this child attends, from the enrolment
   * junction (its first reader) — "Tue 4 Aug — Morning (9:00am – 12:00pm)"
   * for camp slots, "Sat 11 Jul — 9:00am – 10:00am" for single-block
   * sessions. Empty for block enrolments and coach-added offline rows.
   */
  sessions: string[]
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-08-04' → 'Tue 4 Aug' (UTC-anchored — dates are wall-clock UK). */
function fmtShortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return `${DAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MON_SHORT[d.getUTCMonth()]}`
}

/** 'HH:MM[:SS]' → '9:00am'. */
function to12Hour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time
  const period = h < 12 ? 'am' : 'pm'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')}${period}`
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
      .select('id, title, max_spots, current_spots, camp_mode')
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

    // 7b. BUG-23: per-enrolment session/slot attendance from the junction.
    // One line per paid (session, slot) pair, chronological. Never fails the
    // roster — a lookup error just renders enrolments without session lines.
    const sessionLinesByEnrolment: Record<string, string[]> = {}
    if (rows.length > 0) {
      const { data: junctionRows, error: junctionError } = await adminSupabase
        .from('group_programme_enrolment_sessions')
        .select('enrolment_id, group_programme_session_id, slot_index')
        .in('enrolment_id', rows.map(e => e.id))
      if (junctionError) {
        console.error('[GET /roster] enrolment sessions fetch error:', junctionError)
      }

      const sessionIds = [...new Set((junctionRows ?? []).map(j => j.group_programme_session_id))]
      if (sessionIds.length > 0) {
        const { data: sessions, error: sessionsError } = await adminSupabase
          .from('group_programme_sessions')
          .select('id, session_date, start_time, end_time, slots')
          .in('id', sessionIds)
        if (sessionsError) {
          console.error('[GET /roster] sessions fetch error:', sessionsError)
        }
        const sessionById = new Map((sessions ?? []).map(s => [s.id, s]))

        const collected: Record<string, { date: string; slot: number; text: string }[]> = {}
        for (const j of junctionRows ?? []) {
          const session = sessionById.get(j.group_programme_session_id)
          if (!session) continue
          const blocks = expandSessionBlocks(session)
          const block = blocks[j.slot_index] ?? blocks[0]
          if (!block) continue
          const time = `${to12Hour(block.startTime)} – ${to12Hour(block.endTime)}`
          // Slot name only when the day genuinely has multiple blocks —
          // single-block sessions read as plain times.
          const text =
            blocks.length > 1
              ? `${fmtShortDate(session.session_date)} — ${slotDisplayName(block.startTime)} (${time})`
              : `${fmtShortDate(session.session_date)} — ${time}`
          ;(collected[j.enrolment_id] ??= []).push({ date: session.session_date, slot: j.slot_index, text })
        }
        for (const [enrolmentId, lines] of Object.entries(collected)) {
          lines.sort((a, b) => (a.date === b.date ? a.slot - b.slot : a.date.localeCompare(b.date)))
          sessionLinesByEnrolment[enrolmentId] = lines.map(l => l.text)
        }
      }
    }

    // 8. Build response items
    const enrolmentItems: EnrolmentItem[] = rows.map(e => {
      const isOffline = e.payment_type === 'offline'
      const child = e.child_profile_id ? childMap[e.child_profile_id] : null

      // participant_name is the canonical column (migration 020). BUG-20/23:
      // guest PLATFORM enrolments carry it too (the checkout captures it), so
      // prefer it whenever no child profile is linked — previously only
      // offline rows read it and paid guest enrolments showed no child name.
      // cancellation_reason remains the pre-migration offline fallback.
      const childName = child
        ? child.full_name
        : (e.participant_name ??
           (isOffline ? (e.cancellation_reason?.split('\n')[0] ?? null) : null))

      return {
        id: e.id,
        child_name: childName,
        child_dob: child ? child.date_of_birth : null,
        parent_name: isOffline ? 'Added manually' : (userMap[e.booked_by_user_id] || ''),
        payment_type: e.payment_type,
        joined_at_session_number: e.joined_at_session_number,
        status: e.status,
        created_at: e.created_at,
        sessions: sessionLinesByEnrolment[e.id] ?? [],
      }
    })

    const response: RosterResponse = {
      programme_id: programme.id,
      programme_title: programme.title,
      total_spots: programme.max_spots,
      // BUG-23: camps never increment current_spots (per-slot capacity), so
      // the counter would show 0 above a populated list — count the real
      // roster instead. Regular programmes keep the counter (byte-identical).
      enrolled_count: programme.camp_mode === true ? enrolmentItems.length : programme.current_spots,
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

    // 7. AF-H-57: atomic capacity check + increment via optimistic locking.
    // Was: read-then-write race (two concurrent enrolments could both read N and both
    // write N+1, over-enrolling the programme). The .eq('current_spots', N) clause
    // ensures only one of two concurrent requests succeeds.
    const { data: updated, error: updateError } = await adminSupabase
      .from('group_programmes')
      .update({ current_spots: programme.current_spots + 1 })
      .eq('id', programmeId)
      .eq('current_spots', programme.current_spots)         // optimistic lock — match prior value
      .lt('current_spots', programme.max_spots)              // capacity guard at row level
      .select('id')
      .maybeSingle()

    if (updateError || !updated) {
      // Race lost (or DB error) — roll back the enrolment we inserted at step 6.
      // Best-effort: if rollback fails too, log; the orphan row will need manual cleanup.
      console.error('[POST /roster] optimistic increment failed — rolling back enrolment:', updateError)
      const { error: rollbackError } = await adminSupabase
        .from('group_programme_enrolments')
        .delete()
        .eq('id', newEnrolment.id)
      if (rollbackError) {
        console.error('[POST /roster] rollback delete failed (orphan enrolment):', rollbackError)
      }
      return NextResponse.json(
        { error: 'Programme is now full. Please try again.' },
        { status: 409 }
      )
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
      // Coach-added offline rows have no paid session selection.
      sessions: [],
    }

    return NextResponse.json({ enrolment: enrolmentItem }, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/programmes/[programmeId]/roster]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
