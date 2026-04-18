import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AvailabilityTemplateRow {
  id: string
  sport_id: string | null
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
}

interface BlockedDateRow {
  blocked_date: string
  blocked_date_end: string | null
}

interface CoachPolicyRow {
  cancellation_window_hours: number
  min_advance_hours: number
  max_advance_days: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function expandBlockedDates(rows: BlockedDateRow[]): string[] {
  const dates = new Set<string>()
  for (const row of rows) {
    const start = new Date(row.blocked_date)
    const end = row.blocked_date_end ? new Date(row.blocked_date_end) : start
    const cur = new Date(start)
    while (cur <= end) {
      dates.add(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
  }
  return Array.from(dates).sort()
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /api/coaches/[id]/availability
 * Public route — no auth required.
 * Returns availability templates, blocked dates, and booking policy.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const { searchParams } = request.nextUrl

    const from_date = searchParams.get('from_date')
    const to_date = searchParams.get('to_date')
    const sport_id = searchParams.get('sport_id')

    // ── Validate params ───────────────────────────────────────────────────────

    const validationErrors: string[] = []
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/

    if (from_date !== null && !dateRegex.test(from_date)) {
      validationErrors.push('from_date must be in YYYY-MM-DD format')
    }
    if (to_date !== null && !dateRegex.test(to_date)) {
      validationErrors.push('to_date must be in YYYY-MM-DD format')
    }
    if (from_date && to_date && from_date > to_date) {
      validationErrors.push('from_date must be on or before to_date')
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // ── Verify coach exists and is live ───────────────────────────────────────

    const { data: coachPolicy, error: coachError } = await supabase
      .from('coach_profiles')
      .select('cancellation_window_hours, min_advance_hours, max_advance_days')
      .eq('id', id)
      .eq('is_profile_live', true)
      .eq('is_suspended', false)
      .is('deleted_at', null)
      .maybeSingle()

    if (coachError) {
      console.error('[GET /api/coaches/[id]/availability] coach lookup error:', coachError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const policy = coachPolicy as CoachPolicyRow | null

    if (!policy) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
    }

    // ── Fetch availability templates ──────────────────────────────────────────

    let templatesQuery = supabase
      .from('availability_templates')
      .select('id, sport_id, day_of_week, start_time, end_time, is_active')
      .eq('coach_profile_id', id)
      .eq('is_active', true)

    // sport_id filter: match the given sport OR templates with no sport (applies to all)
    if (sport_id !== null) {
      templatesQuery = templatesQuery.or(`sport_id.eq.${sport_id},sport_id.is.null`)
    }

    const { data: templateRows, error: templateError } = await templatesQuery

    if (templateError) {
      console.error('[GET /api/coaches/[id]/availability] templates error:', templateError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // ── Fetch blocked dates ───────────────────────────────────────────────────

    let blockedQuery = supabase
      .from('blocked_dates')
      .select('blocked_date, blocked_date_end')
      .eq('coach_profile_id', id)

    // Filter blocked dates to the requested date window (with range overlap)
    if (from_date) {
      // Include ranges that overlap: range_end >= from_date (or no end, so blocked_date >= from_date)
      blockedQuery = blockedQuery.or(
        `blocked_date_end.gte.${from_date},and(blocked_date_end.is.null,blocked_date.gte.${from_date})`,
      )
    }
    if (to_date) {
      blockedQuery = blockedQuery.lte('blocked_date', to_date)
    }

    const { data: blockedRows, error: blockedError } = await blockedQuery

    if (blockedError) {
      console.error('[GET /api/coaches/[id]/availability] blocked_dates error:', blockedError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // ── Transform ─────────────────────────────────────────────────────────────

    const templates = (templateRows ?? []) as AvailabilityTemplateRow[]
    const blocked = (blockedRows ?? []) as BlockedDateRow[]

    const availability = templates.map(t => ({
      id: t.id,
      sport_id: t.sport_id,
      day_of_week: t.day_of_week,
      start_time: t.start_time.slice(0, 5), // HH:MM
      end_time: t.end_time.slice(0, 5),
    }))

    const blocked_dates = expandBlockedDates(blocked)

    return NextResponse.json(
      {
        availability,
        blocked_dates,
        booking_policy: {
          cancellation_window_hours: policy.cancellation_window_hours,
          min_advance_hours: policy.min_advance_hours,
          max_advance_days: policy.max_advance_days,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('[GET /api/coaches/[id]/availability]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
