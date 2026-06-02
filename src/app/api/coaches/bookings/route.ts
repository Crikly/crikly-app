import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { requireCoachContext } from '@/lib/auth/require-coach'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type Tab = 'today' | 'upcoming' | 'past' | 'cancelled' | 'pending_approval' | 'week'

const VALID_TABS: Tab[] = ['today', 'upcoming', 'past', 'cancelled', 'pending_approval', 'week']
const PAGE_SIZE = 10

// Service-role client for user_profiles lookups.
// user_profiles RLS is "own record only" — service role bypasses it safely
// since we only read the booker's display name.
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── GET /api/coaches/bookings ────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = await createClient()

  const { context, error } = await requireCoachContext(supabase)
  if (error) return error
  const { coachProfile } = context

  // 5. Parse query params
  const { searchParams } = new URL(request.url)
  const rawTab = searchParams.get('tab') ?? 'upcoming'
  if (!VALID_TABS.includes(rawTab as Tab)) {
    return NextResponse.json(
      { error: 'Validation failed', details: ['tab must be one of: today, upcoming, past, cancelled, pending_approval, week'] },
      { status: 400 },
    )
  }
  const tab = rawTab as Tab

  const rawPage = parseInt(searchParams.get('page') ?? '1', 10)
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage
  const offset = (page - 1) * PAGE_SIZE

  // 6. Build tab-filtered bookings query
  const todayIso = new Date().toISOString().slice(0, 10)
  const base = supabase
    .from('bookings')
    .select('id, booking_reference, session_date, session_start_time, session_end_time, session_type, status, sport_id, coach_price_pence, parent_total_pence, currency, booked_by_user_id, child_profile_id, messaging_unlocked, created_at, venue_name')
    .eq('coach_profile_id', coachProfile.id)
    .is('deleted_at', null)

  let filtered
  if (tab === 'today') {
    filtered = base.eq('session_date', todayIso)
  } else if (tab === 'upcoming') {
    filtered = base.gt('session_date', todayIso).eq('status', 'confirmed')
  } else if (tab === 'past') {
    filtered = base.in('status', ['completed', 'no_show'])
  } else if (tab === 'pending_approval') {
    filtered = base.in('status', ['pending_approval'])
  } else if (tab === 'week') {
    // DS-RIGHT-PANEL-01 + BUG-QA-02: returns Mon-Sun of (today + offset
    // weeks), all statuses except cancelled. Powers the right-panel week
    // strip + daily lineup so coaches can scrub back/forward to past or
    // future sessions and still see correct dot indicators. Server-local
    // time is acceptable for Phase 1 (UK-only). Offset clamped to ±52
    // weeks — a year forward/back is plenty for the strip.
    const rawOffset = parseInt(searchParams.get('offset') ?? '0', 10)
    const weekOffset = isNaN(rawOffset) ? 0 : Math.max(-52, Math.min(52, rawOffset))
    const today = new Date()
    const dayOfWeek = today.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset + weekOffset * 7)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const mondayIso = monday.toISOString().slice(0, 10)
    const sundayIso = sunday.toISOString().slice(0, 10)
    filtered = base
      .gte('session_date', mondayIso)
      .lte('session_date', sundayIso)
      .not('status', 'in', '(cancelled_parent,cancelled_coach)')
  } else {
    filtered = base.in('status', ['cancelled_parent', 'cancelled_coach'])
  }

  const ascending = tab === 'today' || tab === 'upcoming' || tab === 'pending_approval' || tab === 'week'
  const { data: bookings, error: bookingsError } = await filtered
    .order('session_date', { ascending })
    .order('session_start_time', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)

  if (bookingsError) {
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }

  const rows = bookings as BookingRow[]

  // 7. Batch-fetch booker names via admin client (user_profiles RLS blocks server client)
  const bookerIds = [...new Set(rows.map((b) => b.booked_by_user_id))]
  const bookerNameMap: Record<string, string> = {}
  if (bookerIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('user_profiles')
      .select('id, full_name')
      .in('id', bookerIds)
    profiles?.forEach((p) => { bookerNameMap[p.id] = p.full_name })
  }

  // 8. Batch-fetch child names (coach can read child_profiles via RLS for their bookings)
  const childIds = [...new Set(rows.map((b) => b.child_profile_id).filter(Boolean))] as string[]
  const childNameMap: Record<string, string> = {}
  if (childIds.length > 0) {
    const { data: children } = await supabase
      .from('child_profiles')
      .select('id, full_name')
      .in('id', childIds)
    children?.forEach((c) => { childNameMap[c.id] = c.full_name })
  }

  const items = rows.map((b) => ({
    id: b.id,
    booking_reference: b.booking_reference,
    session_date: b.session_date,
    session_start_time: b.session_start_time,
    session_end_time: b.session_end_time,
    session_type: b.session_type,
    status: b.status,
    sport_id: b.sport_id,
    coach_price_pence: b.coach_price_pence,
    parent_total_pence: b.parent_total_pence,
    currency: b.currency,
    booked_by_user_profile_id: b.booked_by_user_id,
    booked_by_name: bookerNameMap[b.booked_by_user_id] ?? null,
    child_profile_id: b.child_profile_id,
    child_name: b.child_profile_id ? (childNameMap[b.child_profile_id] ?? null) : null,
    messaging_unlocked: b.messaging_unlocked,
    venue_name: b.venue_name ?? null,
    created_at: b.created_at,
  }))

  return NextResponse.json({
    bookings: items,
    pagination: {
      page,
      page_size: PAGE_SIZE,
      has_more: items.length === PAGE_SIZE,
    },
  })
}
