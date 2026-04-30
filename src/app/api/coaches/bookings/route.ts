import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type Tab = 'today' | 'upcoming' | 'past' | 'cancelled' | 'pending_approval'

const VALID_TABS: Tab[] = ['today', 'upcoming', 'past', 'cancelled', 'pending_approval']
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

  // 1. Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // 2. user_profiles
  const { data: userProfile, error: upError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (upError || !userProfile) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
  }

  // 3. Coach role check
  const { data: roleRow, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_profile_id', userProfile.id)
    .eq('role', 'coach')
    .single()
  if (roleError || !roleRow) {
    return NextResponse.json({ error: 'Forbidden: coach role required' }, { status: 403 })
  }

  // 4. coach_profiles
  const { data: coachProfile, error: cpError } = await supabase
    .from('coach_profiles')
    .select('id')
    .eq('user_profile_id', userProfile.id)
    .single()
  if (cpError || !coachProfile) {
    return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 })
  }

  // 5. Parse query params
  const { searchParams } = new URL(request.url)
  const rawTab = searchParams.get('tab') ?? 'upcoming'
  if (!VALID_TABS.includes(rawTab as Tab)) {
    return NextResponse.json(
      { error: 'Validation failed', details: ['tab must be one of: today, upcoming, past, cancelled, pending_approval'] },
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
  } else {
    filtered = base.in('status', ['cancelled_parent', 'cancelled_coach'])
  }

  const ascending = tab === 'today' || tab === 'upcoming' || tab === 'pending_approval'
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
