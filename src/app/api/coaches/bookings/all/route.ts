import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { requireCoachContext } from '@/lib/auth/require-coach'

// ─── GET /api/coaches/bookings/all ────────────────────────────────────────────
//
// Fix-BOOKINGS-ALL-ENDPOINT: consolidates the three per-mount BookingsContext
// fetches (upcoming / pending_approval / week) into ONE request. The three
// bucket queries run on a SINGLE server Supabase client (one serverless
// invocation, one pooled connection instead of three), and booker + child name
// lookups resolve ONCE over the union of all rows (was 3× each in the per-tab
// route). Filters/order/caps are copied verbatim from ../route.ts — no drift.
//
// The per-tab ../route.ts endpoint stays for pagination, past/cancelled tabs,
// and off-week strip slices (?offset). This endpoint only serves the mount batch.

type BookingRow = Database['public']['Tables']['bookings']['Row']

const PAGE_SIZE = 10

// Service-role client for booker-name lookups: user_profiles RLS is
// "own record only", so the server client can't read other users' names.
// Lazy-init (Fix-LINT-02) so module import never throws at build time.
function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
let _supabaseAdmin: ReturnType<typeof createAdminClient> | null = null
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createAdminClient()
  }
  return _supabaseAdmin
}

const SELECT =
  'id, booking_reference, session_date, session_start_time, session_end_time, session_type, status, sport_id, coach_price_pence, parent_total_pence, currency, booked_by_user_id, child_profile_id, participant_name, messaging_unlocked, created_at, venue_name'

export async function GET() {
  const supabase = await createClient()

  const { context, error } = await requireCoachContext(supabase)
  if (error) return error
  const { coachProfile } = context

  const todayIso = new Date().toISOString().slice(0, 10)

  // Current week Mon-Sun (server-local) — identical to ?tab=week offset=0 in ../route.ts.
  const today = new Date()
  const dayOfWeek = today.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(today)
  monday.setDate(today.getDate() + mondayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const mondayIso = monday.toISOString().slice(0, 10)
  const sundayIso = sunday.toISOString().slice(0, 10)

  // Three bucket queries on ONE server client. Filters/order/caps copied
  // verbatim from ../route.ts (upcoming / pending_approval / week tabs).
  const [upcomingRes, pendingRes, weekRes] = await Promise.all([
    supabase
      .from('bookings')
      .select(SELECT)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .gte('session_date', todayIso)
      .eq('status', 'confirmed')
      .order('session_date', { ascending: true })
      .order('session_start_time', { ascending: true })
      .range(0, PAGE_SIZE - 1),
    supabase
      .from('bookings')
      .select(SELECT)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .in('status', ['pending_approval'])
      .order('session_date', { ascending: true })
      .order('session_start_time', { ascending: true })
      .range(0, PAGE_SIZE - 1),
    supabase
      .from('bookings')
      .select(SELECT)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .gte('session_date', mondayIso)
      .lte('session_date', sundayIso)
      .not('status', 'in', '(cancelled_parent,cancelled_coach)')
      .order('session_date', { ascending: true })
      .order('session_start_time', { ascending: true })
      .range(0, PAGE_SIZE - 1),
  ])

  if (upcomingRes.error || pendingRes.error || weekRes.error) {
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }

  const upcomingRows = (upcomingRes.data ?? []) as BookingRow[]
  const pendingRows = (pendingRes.data ?? []) as BookingRow[]
  const weekRows = (weekRes.data ?? []) as BookingRow[]

  // Resolve booker + child names ONCE over the union of all three buckets
  // (the per-tab route runs these lookups separately for each tab).
  const allRows = [...upcomingRows, ...pendingRows, ...weekRows]

  const bookerIds = [...new Set(allRows.map((b) => b.booked_by_user_id))]
  const bookerNameMap: Record<string, string> = {}
  if (bookerIds.length > 0) {
    const { data: profiles } = await getSupabaseAdmin()
      .from('user_profiles')
      .select('id, full_name')
      .in('id', bookerIds)
    profiles?.forEach((p) => { bookerNameMap[p.id] = p.full_name })
  }

  const childIds = [...new Set(allRows.map((b) => b.child_profile_id).filter(Boolean))] as string[]
  const childNameMap: Record<string, string> = {}
  if (childIds.length > 0) {
    const { data: children } = await supabase
      .from('child_profiles')
      .select('id, full_name')
      .in('id', childIds)
    children?.forEach((c) => { childNameMap[c.id] = c.full_name })
  }

  // Same item shape as ../route.ts so consumers see identical objects.
  const toItem = (b: BookingRow) => ({
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
    // Linked child profile first, then the guest participant snapshot (UX-16) —
    // mirrors ../route.ts so consumers see identical objects.
    child_name: b.child_profile_id
      ? (childNameMap[b.child_profile_id] ?? null)
      : (b.participant_name ?? null),
    messaging_unlocked: b.messaging_unlocked,
    venue_name: b.venue_name ?? null,
    created_at: b.created_at,
  })

  return NextResponse.json({
    upcoming: upcomingRows.map(toItem),
    pendingApproval: pendingRows.map(toItem),
    thisWeek: weekRows.map(toItem),
  })
}
