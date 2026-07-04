import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AvailabilityTemplateRow {
  id: string
  sport_id: string | null
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
  // BUG-08: per-block price override. NULL = use the sport default; non-null =
  // this block costs a different price (e.g. £75 Sunday vs £60 default).
  price_override_pence: number | null
  // UX-09: where the session happens. Either a free-text venue_name on the block,
  // or a coach_venue_id pointing at a coach_venues row (the venue-picker path).
  venue_name: string | null
  coach_venue_id: string | null
  // BUG-04: recurrence shape. is_recurring=false (⟺ specific_date set) marks an
  // ad-hoc one-off slot, which the public calendar renders with a teal dot.
  is_recurring: boolean
  specific_date: string | null
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

interface BookedSlotRow {
  session_date: string
  session_start_time: string
  session_end_time: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Local-timezone YYYY-MM-DD (mirrors slots.localISODate). */
function localISODate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

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
    // AF-H-59: validate sport_id as UUID before PostgREST .or() interpolation.
    // Public no-auth route — without this guard, a crafted sport_id could break
    // out of the .or() filter and expose other coaches' availability.
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (from_date !== null && !dateRegex.test(from_date)) {
      validationErrors.push('from_date must be in YYYY-MM-DD format')
    }
    if (to_date !== null && !dateRegex.test(to_date)) {
      validationErrors.push('to_date must be in YYYY-MM-DD format')
    }
    if (from_date && to_date && from_date > to_date) {
      validationErrors.push('from_date must be on or before to_date')
    }
    if (sport_id !== null && !uuidRegex.test(sport_id)) {
      validationErrors.push('sport_id must be a valid UUID')
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
      .select('id, sport_id, day_of_week, start_time, end_time, is_active, price_override_pence, venue_name, coach_venue_id, is_recurring, specific_date')
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

    // ── Resolve venue labels (UX-09) ──────────────────────────────────────────
    // A block's venue is either its free-text venue_name or a coach_venues row
    // referenced by coach_venue_id (the venue-picker path). Mirror the coach-facing
    // route (POST /api/coaches/availability) and resolve the FK to a name so every
    // coach's venue surfaces, not just free-text ones. coach_venues has a
    // public-SELECT policy for live coaches, so this read is RLS-safe.
    const templateRowsTyped = (templateRows ?? []) as AvailabilityTemplateRow[]
    const venueIds = Array.from(
      new Set(
        templateRowsTyped
          .filter(t => !t.venue_name && t.coach_venue_id)
          .map(t => t.coach_venue_id as string),
      ),
    )

    let venueMap: Record<string, string> = {}
    if (venueIds.length > 0) {
      const { data: venueRows, error: venueError } = await supabase
        .from('coach_venues')
        .select('id, name')
        .eq('coach_profile_id', id)
        .in('id', venueIds)

      if (venueError) {
        console.error('[GET /api/coaches/[id]/availability] coach_venues error:', venueError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      venueMap = Object.fromEntries(
        ((venueRows ?? []) as { id: string; name: string }[]).map(v => [v.id, v.name]),
      )
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

    // ── Fetch booked slots (BUG-14 / BUG-19 Phase 1) ──────────────────────────
    // Live bookings must reach the public calendar so booked slots stop
    // rendering as bookable. `bookings` has no public SELECT policy (booker/
    // coach only), so this single read uses the admin client — a deliberate,
    // Lasith-approved exception (BUG-19 Phase 1 Step 0 approval, 4 Jul 2026)
    // to this route's RLS-respecting rule. It is read-only and the response is
    // shaped to busy INTERVALS only ({date, start_time, end_time}) — no ids,
    // no participant data, no status ever leaves the server.
    //
    // Predicate mirrors migration 034's slot-holding partial unique index
    // EXACTLY: pending_payment holds the slot (a parent mid-checkout must not
    // lose it), cancelled/no-show/soft-deleted rows free it. Window: today
    // through the coach's max-advance horizon (the only bookable range),
    // intersected with any from_date/to_date the caller passed.
    const today = new Date()
    const horizon = new Date(today)
    horizon.setDate(horizon.getDate() + policy.max_advance_days)

    let bookedWindowStart = localISODate(today)
    if (from_date && from_date > bookedWindowStart) bookedWindowStart = from_date
    let bookedWindowEnd = localISODate(horizon)
    if (to_date && to_date < bookedWindowEnd) bookedWindowEnd = to_date

    let bookedRows: BookedSlotRow[] = []
    if (bookedWindowStart <= bookedWindowEnd) {
      const adminSupabase = createAdminClient()
      const { data: bookingData, error: bookingsError } = await adminSupabase
        .from('bookings')
        .select('session_date, session_start_time, session_end_time')
        .eq('coach_profile_id', id)
        .gte('session_date', bookedWindowStart)
        .lte('session_date', bookedWindowEnd)
        .is('deleted_at', null)
        // Unquoted PostgREST in-list — matches lib/availability/commitments.ts;
        // quoted values silently no-match.
        .not('status', 'in', '(cancelled_parent,cancelled_coach,no_show)')

      if (bookingsError) {
        console.error('[GET /api/coaches/[id]/availability] booked slots error:', bookingsError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }
      bookedRows = (bookingData ?? []) as BookedSlotRow[]
    }

    const booked_slots = bookedRows.map(b => ({
      date: b.session_date.slice(0, 10),
      start_time: b.session_start_time.slice(0, 5), // HH:MM
      end_time: b.session_end_time.slice(0, 5),
    }))

    // ── Transform ─────────────────────────────────────────────────────────────

    const blocked = (blockedRows ?? []) as BlockedDateRow[]

    const availability = templateRowsTyped.map(t => ({
      id: t.id,
      sport_id: t.sport_id,
      day_of_week: t.day_of_week,
      start_time: t.start_time.slice(0, 5), // HH:MM
      end_time: t.end_time.slice(0, 5),
      // BUG-08: surface the per-block override so the time picker can price each
      // slot. NULL is preserved (not coerced) so the client can fall back to the
      // sport default. Authoritative price is still re-derived server-side at
      // booking time (BUG-09) — this value is for display only.
      price_override_pence: t.price_override_pence,
      // UX-09: the block's venue label — free-text venue_name, else the resolved
      // coach_venues name, else null (the client shows nothing when null).
      venue_name: t.venue_name ?? (t.coach_venue_id ? venueMap[t.coach_venue_id] ?? null : null),
      // BUG-04: surface recurrence so the public calendar can render the teal
      // ad-hoc dot. specific_date tells the frontend which date the dot belongs
      // to (a bare boolean wouldn't). Mirrors the coach-facing availability route.
      is_recurring: t.is_recurring,
      specific_date: t.specific_date,
    }))

    const blocked_dates = expandBlockedDates(blocked)

    return NextResponse.json(
      {
        availability,
        blocked_dates,
        booked_slots,
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
