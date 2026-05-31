// SCHEDULE-PROG-SESSIONS: per-session list of scheduled group programme
// sessions for the authenticated coach within a date range. Powers the
// purple "programme" blocks on /coach/schedule.
//
// Read pattern mirrors GET /api/coaches/programmes/[programmeId]:
//   - requireCoachContext (Variant B) for auth + coachProfile lookup
//   - adminSupabase for the table reads (the existing public SELECT
//     policy on group_programme_sessions only fires when the parent
//     programme is status='active', which we already filter on, but
//     ownership is the contract enforced here — admin client keeps the
//     dev-DB auth_user_id mismatch from biting us)
//   - No nested PostgREST joins — fetch programmes, then sessions, then
//     venue names in three explicit queries (Fix-65-1 pattern)
//
// Camp-mode `group_programme_sessions.slots` jsonb is intentionally NOT
// projected. The grid renders one EventBlock per session row using the
// row's own start_time / end_time; visualising multiple time blocks per
// camp day needs its own design decision and is tracked as a follow-up.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCoachContext } from '@/lib/auth/require-coach'

interface ProgrammeSessionResponse {
  id: string
  session_date: string         // 'YYYY-MM-DD'
  start_time: string           // 'HH:MM:SS' (Postgres time)
  end_time: string             // 'HH:MM:SS'
  programme_id: string
  programme_title: string
  current_spots: number
  max_spots: number
  venue_name: string | null
}

const YYYYMMDD_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidYYYYMMDD(value: string): boolean {
  if (!YYYYMMDD_RE.test(value)) return false
  const t = new Date(`${value}T00:00:00`)
  return !Number.isNaN(t.getTime())
}

/**
 * GET /api/coaches/programme-sessions?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns scheduled sessions for the authenticated coach's active
 * programmes whose `session_date` falls within [from, to] inclusive.
 * Cancelled / completed sessions and inactive programmes are excluded.
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<{ sessions: ProgrammeSessionResponse[] } | { error: string; details?: unknown }>> {
  try {
    const supabase = await createClient()

    const { context, error: authError } = await requireCoachContext(supabase)
    if (authError) return authError
    const { coachProfile } = context

    // 1. Validate query params.
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const validationErrors: string[] = []
    if (!from) validationErrors.push('from is required (YYYY-MM-DD)')
    else if (!isValidYYYYMMDD(from)) validationErrors.push('from must be a valid YYYY-MM-DD date')
    if (!to) validationErrors.push('to is required (YYYY-MM-DD)')
    else if (!isValidYYYYMMDD(to)) validationErrors.push('to must be a valid YYYY-MM-DD date')
    if (from && to && isValidYYYYMMDD(from) && isValidYYYYMMDD(to) && from > to) {
      validationErrors.push('from must be on or before to')
    }
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 },
      )
    }

    const adminSupabase = createAdminClient()

    // 2. Fetch the coach's active programmes. Ownership + status + soft-delete
    //    filter is enforced here, so the IN clause below cannot leak rows
    //    from programmes the coach doesn't own or that are inactive.
    const { data: programmes, error: programmesError } = await adminSupabase
      .from('group_programmes')
      .select('id, title, current_spots, max_spots, venue_name')
      .eq('coach_profile_id', coachProfile.id)
      .eq('status', 'active')
      .is('deleted_at', null)

    if (programmesError) {
      console.error('[GET /api/coaches/programme-sessions] programmes fetch error:', programmesError)
      return NextResponse.json({ error: 'Failed to fetch programmes' }, { status: 500 })
    }
    if (!programmes || programmes.length === 0) {
      return NextResponse.json({ sessions: [] }, { status: 200 })
    }

    const programmeIds = programmes.map((p) => p.id as string)
    const programmeById = new Map(
      programmes.map((p) => [
        p.id as string,
        {
          title: p.title as string,
          current_spots: (p.current_spots as number) ?? 0,
          max_spots: (p.max_spots as number) ?? 0,
          venue_name: (p.venue_name as string | null) ?? null,
        },
      ]),
    )

    // 3. Fetch the in-range scheduled sessions for those programmes.
    const { data: sessions, error: sessionsError } = await adminSupabase
      .from('group_programme_sessions')
      .select('id, group_programme_id, session_date, start_time, end_time, coach_venue_id')
      .in('group_programme_id', programmeIds)
      .gte('session_date', from as string)
      .lte('session_date', to as string)
      .eq('status', 'scheduled')
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (sessionsError) {
      console.error('[GET /api/coaches/programme-sessions] sessions fetch error:', sessionsError)
      return NextResponse.json({ error: 'Failed to fetch programme sessions' }, { status: 500 })
    }

    const rows = sessions ?? []
    if (rows.length === 0) {
      return NextResponse.json({ sessions: [] }, { status: 200 })
    }

    // 4. Batch-fetch per-session venue overrides (Fix-65-1 pattern — no nested join).
    const venueIds = [...new Set(
      rows
        .map((r) => r.coach_venue_id as string | null)
        .filter((id): id is string => id !== null),
    )]

    const venueNameById: Map<string, string> = new Map()
    if (venueIds.length > 0) {
      const { data: venues, error: venuesError } = await adminSupabase
        .from('coach_venues')
        .select('id, name')
        .in('id', venueIds)
      if (venuesError) {
        // Venue lookup is non-fatal — fall back to programme-level venue name.
        console.error('[GET /api/coaches/programme-sessions] venues fetch error:', venuesError)
      } else {
        (venues ?? []).forEach((v) => {
          venueNameById.set(v.id as string, v.name as string)
        })
      }
    }

    // 5. Project to the response shape. Session-level venue override wins;
    //    falls back to the programme-level venue_name when absent.
    const response: ProgrammeSessionResponse[] = rows.map((r) => {
      const programmeId = r.group_programme_id as string
      const prog = programmeById.get(programmeId)
      const sessionVenueId = r.coach_venue_id as string | null
      const sessionVenueName = sessionVenueId ? (venueNameById.get(sessionVenueId) ?? null) : null
      return {
        id: r.id as string,
        session_date: r.session_date as string,
        start_time: r.start_time as string,
        end_time: r.end_time as string,
        programme_id: programmeId,
        programme_title: prog?.title ?? '',
        current_spots: prog?.current_spots ?? 0,
        max_spots: prog?.max_spots ?? 0,
        venue_name: sessionVenueName ?? prog?.venue_name ?? null,
      }
    })

    return NextResponse.json({ sessions: response }, { status: 200 })
  } catch (error) {
    console.error('[GET /api/coaches/programme-sessions]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
