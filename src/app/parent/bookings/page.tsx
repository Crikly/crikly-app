import { createClient } from '@/lib/supabase/server'
import { ParentBookingsClient } from '@/components/parent/bookings/ParentBookingsClient'
import {
  coachInitials,
  formatPaidLabel,
  formatSessionLine,
  formatShortWhenLabel,
  formatWhenLabel,
} from '@/components/parent/bookings/format'
import {
  londonSessionToMs,
  londonTodayDateString,
  nextDateString,
} from '@/lib/time/london'
import { firstNameOf } from '@/constants/childIdentity'
import type {
  ParentBookingItem,
  ParentBookingStatus,
  ParentBookingsData,
} from '@/components/parent/bookings/types'

// P-14 (Block 1 Session 2): parent bookings management. Same shape as
// parent/dashboard/page.tsx — one server component fetches everything via the
// RLS client ("Users can view own bookings as booker"; child names must never
// be fetched client-side — COPPA rule), then hands one typed prop to the
// client orchestrator. Failures degrade to empty tabs with a server-side log.

export const dynamic = 'force-dynamic'

// Supabase nested joins may come back as object or array depending on the
// relationship's inferred cardinality (same normalisation as the dashboards).
function firstOf<T>(value: T | T[] | null): T | null {
  if (value === null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

interface BookingQueryRow {
  id: string
  booking_reference: string
  status: string
  session_type: string
  session_date: string
  session_start_time: string
  session_end_time: string
  additional_participants: unknown
  participant_name: string | null
  venue_name: string | null
  venue_address: string | null
  parent_total_pence: number
  currency: string
  cancellation_window_hours: number
  cancelled_at: string | null
  cancelled_by: string | null
  coach_profile_id: string
  coach_profiles: { display_name: string | null } | { display_name: string | null }[] | null
  sports: { name: string } | { name: string }[] | null
  child_profiles: { full_name: string } | { full_name: string }[] | null
}

const KNOWN_STATUSES: ParentBookingStatus[] = [
  'confirmed',
  'completed',
  'cancelled_parent',
  'cancelled_coach',
  'no_show',
]

function narrowStatus(status: string): ParentBookingStatus {
  if ((KNOWN_STATUSES as string[]).includes(status)) {
    return status as ParentBookingStatus
  }
  // Surface unknown statuses loudly — rendering them as active bookings
  // silently would mask a data-integrity problem.
  console.error('[ParentBookings] unknown booking status:', status)
  return 'confirmed'
}

/** "12 August" in London time, from a timestamptz ISO string. */
function cancelledDayLabel(cancelledAt: string): string {
  return new Date(cancelledAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/London',
  })
}

function cancelledLineFor(row: BookingQueryRow): string | null {
  if (row.status === 'cancelled_coach') {
    // BR-04: coach cancels any time → full refund to parent.
    return 'Your coach cancelled this session — you’ll receive a full refund.'
  }
  if (row.status === 'cancelled_parent') {
    return row.cancelled_at
      ? `This booking was cancelled on ${cancelledDayLabel(row.cancelled_at)}.`
      : 'This booking was cancelled.'
  }
  return null
}

async function loadBookingsData(): Promise<ParentBookingsData> {
  const empty: ParentBookingsData = { upcoming: [], past: [] }
  const supabase = await createClient()

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return empty

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!userProfile) return empty

    const { data: rows, error } = await supabase
      .from('bookings')
      .select(
        `
        id,
        booking_reference,
        status,
        session_type,
        session_date,
        session_start_time,
        session_end_time,
        additional_participants,
        participant_name,
        venue_name,
        venue_address,
        parent_total_pence,
        currency,
        cancellation_window_hours,
        cancelled_at,
        cancelled_by,
        coach_profile_id,
        coach_profiles ( display_name ),
        sports ( name ),
        child_profiles ( full_name )
      `,
      )
      .eq('booked_by_user_id', userProfile.id)
      .neq('status', 'pending_payment')
      .is('deleted_at', null)
      .order('session_date', { ascending: true })
      .order('session_start_time', { ascending: true })

    if (error) {
      console.error('[ParentBookings] bookings fetch failed:', error)
      return empty
    }
    const bookings = (rows ?? []) as BookingQueryRow[]

    // Approved venue fallback (P-14 decision c): checkout bookings carry no
    // venue snapshot (migration 025 only backfilled) — resolve the coach's
    // default venue at read time; copy fallback last. No checkout-route touch.
    const coachIdsNeedingVenue = [
      ...new Set(
        bookings.filter((b) => !b.venue_name).map((b) => b.coach_profile_id),
      ),
    ]
    const coachVenueById = new Map<string, { name: string; address: string | null }>()
    if (coachIdsNeedingVenue.length > 0) {
      const { data: venues } = await supabase
        .from('coach_venues')
        .select('coach_profile_id, name, address, is_default')
        .in('coach_profile_id', coachIdsNeedingVenue)
        .order('created_at', { ascending: true })
      for (const venue of venues ?? []) {
        const existing = coachVenueById.get(venue.coach_profile_id)
        // Prefer the default venue; otherwise keep the first one seen.
        if (!existing || venue.is_default) {
          coachVenueById.set(venue.coach_profile_id, {
            name: venue.name,
            address: venue.address,
          })
        }
      }
    }

    const nowMs = Date.now()
    const todayStr = londonTodayDateString(nowMs)
    const tomorrowStr = nextDateString(todayStr)

    const items: ParentBookingItem[] = bookings.map((row) => {
      const coach = firstOf(row.coach_profiles)
      const sport = firstOf(row.sports)
      const child = firstOf(row.child_profiles)

      const coachName = coach?.display_name || 'Your coach'
      const sportName = sport?.name || 'Cricket'
      const playerCount =
        1 +
        (Array.isArray(row.additional_participants)
          ? row.additional_participants.length
          : 0)

      const venueParts = row.venue_name
        ? { name: row.venue_name, address: row.venue_address }
        : (coachVenueById.get(row.coach_profile_id) ?? null)
      const icsVenue = venueParts
        ? venueParts.address
          ? `${venueParts.name}, ${venueParts.address}`
          : venueParts.name
        : null

      const status = narrowStatus(row.status)
      const sessionStartMs = londonSessionToMs(row.session_date, row.session_start_time)
      const sessionEndMs = londonSessionToMs(row.session_date, row.session_end_time)
      const participantName = child?.full_name || row.participant_name || ''

      return {
        id: row.id,
        reference: row.booking_reference,
        status,
        coachName,
        coachInitials: coachInitials(coachName),
        sportName,
        sessionLine: formatSessionLine(sportName, row.session_type, playerCount),
        whenLabel: formatWhenLabel(
          row.session_date,
          row.session_start_time,
          row.session_end_time,
          todayStr,
          tomorrowStr,
        ),
        shortWhenLabel: formatShortWhenLabel(
          row.session_date,
          row.session_start_time,
          todayStr,
          tomorrowStr,
        ),
        venueLabel: icsVenue ?? 'At your coach’s venue',
        participantLabel: firstNameOf(participantName) || 'your player',
        paidLabel: formatPaidLabel(row.parent_total_pence, row.currency),
        sessionStartMs,
        sessionEndMs,
        cancellationWindowHours: row.cancellation_window_hours,
        allowsCancel:
          status === 'confirmed' &&
          row.cancellation_window_hours > 0 &&
          sessionStartMs > nowMs,
        isCancelled: status === 'cancelled_parent' || status === 'cancelled_coach',
        cancelledLine: cancelledLineFor(row),
        sessionDate: row.session_date,
        startTime: row.session_start_time,
        endTime: row.session_end_time,
        icsVenue,
      }
    })

    // Upcoming = session not yet finished (ascending, soonest first);
    // Past = finished sessions, most recent first.
    return {
      upcoming: items.filter((b) => b.sessionEndMs >= nowMs),
      past: items.filter((b) => b.sessionEndMs < nowMs).reverse(),
    }
  } catch (error) {
    console.error('[ParentBookings] data fetch failed:', error)
    return empty
  }
}

export default async function ParentBookingsPage() {
  const data = await loadBookingsData()
  return <ParentBookingsClient data={data} />
}
