import { createClient } from '@/lib/supabase/server'
import { ParentBookingsClient } from '@/components/parent/bookings/ParentBookingsClient'
import {
  coachInitials,
  formatPaidLabel,
  formatProgrammeDateLabel,
  formatProgrammeShortWhenLabel,
  formatProgrammeWhenLabel,
  formatSessionLine,
  formatShortWhenLabel,
  formatWhenLabel,
  stableColourIndex,
} from '@/components/parent/bookings/format'
import { childIdentityColour } from '@/constants/childIdentity'
import {
  londonSessionToMs,
  londonTodayDateString,
  nextDateString,
} from '@/lib/time/london'
import { firstNameOf } from '@/constants/childIdentity'

// Design fix 3: payment_intents deliberately stores no card metadata
// ("No card data is ever stored" — migration 006). "Card ending ××××" would
// need a per-booking live Stripe read or a webhook-time stash (schema
// change) — flagged to Lasith; until then every booking shows the generic
// label.
const PAYMENT_METHOD_FALLBACK = 'Card payment'
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

// ── PROGRAMME-BOOKINGS-LIST ──────────────────────────────────────────────────
// Basic view of the parent's group-programme enrolments: ONE entry per
// enrolment covering all its paid dates, shaped as a ParentBookingItem so the
// existing card/row/panel render it unchanged. No cancel (allowsCancel is
// hard-false — enrolment cancellation is later, bigger work) and no .ics
// (single-date builder). Additive only: the bookings query and mapping above
// are untouched; failures degrade to [] with a server-side log.
//
// Read path is the RLS client throughout (COPPA — child names never fetched
// client-side): group_programme_enrolments_select_own (fixed in migration
// 055), gpe_sessions_select_own, and the public programme/session policies.
// KNOWN LIMIT (flagged): the public policies expose only status='active'
// programmes, so enrolments on a paused/completed programme come back with
// null joins and are skipped with a loud log — surfacing those needs an RLS
// design pass, not a page change.

interface EnrolmentQueryRow {
  id: string
  enrolment_reference: string | null
  status: string
  payment_model: string
  parent_total_pence: number | null
  block_amount_pence: number | null
  currency: string
  participant_name: string | null
  cancelled_at: string | null
  programme_id: string
  child_profiles: { full_name: string } | { full_name: string }[] | null
  group_programmes:
    | {
        id: string
        title: string
        coach_profile_id: string
        coach_venue_id: string | null
        coach_profiles: { display_name: string | null } | { display_name: string | null }[] | null
        sports: { name: string } | { name: string }[] | null
      }
    | {
        id: string
        title: string
        coach_profile_id: string
        coach_venue_id: string | null
        coach_profiles: { display_name: string | null } | { display_name: string | null }[] | null
        sports: { name: string } | { name: string }[] | null
      }[]
    | null
}

interface EnrolmentSessionRow {
  session_date: string
  start_time: string
  end_time: string
  status: string
  coach_venue_id: string | null
}

function enrolmentStatus(status: string): ParentBookingStatus {
  if (status === 'cancelled') return 'cancelled_parent'
  if (status === 'completed') return 'completed'
  if (status !== 'active') {
    console.error('[ParentBookings] unknown enrolment status:', status)
  }
  return 'confirmed'
}

async function loadEnrolmentItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userProfileId: string,
): Promise<ParentBookingItem[]> {
  const { data: enrolRows, error } = await supabase
    .from('group_programme_enrolments')
    .select(
      `
      id,
      enrolment_reference,
      status,
      payment_model,
      parent_total_pence,
      block_amount_pence,
      currency,
      participant_name,
      cancelled_at,
      programme_id,
      child_profiles ( full_name ),
      group_programmes (
        id,
        title,
        coach_profile_id,
        coach_venue_id,
        coach_profiles ( display_name ),
        sports ( name )
      )
    `,
    )
    .eq('booked_by_user_id', userProfileId)
    .eq('payment_status', 'succeeded')

  if (error) {
    console.error('[ParentBookings] enrolments fetch failed:', error)
    return []
  }
  const enrolments = (enrolRows ?? []) as EnrolmentQueryRow[]
  if (enrolments.length === 0) return []

  // Dates: per_session enrolments own explicit (session) rows; block
  // enrolments cover every session of the programme.
  const perSessionIds = enrolments
    .filter((e) => e.payment_model === 'per_session')
    .map((e) => e.id)
  const blockProgrammeIds = [
    ...new Set(
      enrolments
        .filter((e) => e.payment_model === 'block')
        .map((e) => firstOf(e.group_programmes)?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]

  const sessionsByEnrolment = new Map<string, EnrolmentSessionRow[]>()
  const sessionsByProgramme = new Map<string, EnrolmentSessionRow[]>()

  if (perSessionIds.length > 0) {
    const { data: linkRows, error: linkError } = await supabase
      .from('group_programme_enrolment_sessions')
      .select(
        'enrolment_id, group_programme_sessions ( session_date, start_time, end_time, status, coach_venue_id )',
      )
      .in('enrolment_id', perSessionIds)
    if (linkError) {
      console.error('[ParentBookings] enrolment sessions fetch failed:', linkError)
    }
    for (const link of (linkRows ?? []) as {
      enrolment_id: string
      group_programme_sessions: EnrolmentSessionRow | EnrolmentSessionRow[] | null
    }[]) {
      const session = firstOf(link.group_programme_sessions)
      if (!session) continue
      const list = sessionsByEnrolment.get(link.enrolment_id) ?? []
      list.push(session)
      sessionsByEnrolment.set(link.enrolment_id, list)
    }
  }

  if (blockProgrammeIds.length > 0) {
    const { data: progSessions, error: progError } = await supabase
      .from('group_programme_sessions')
      .select('group_programme_id, session_date, start_time, end_time, status, coach_venue_id')
      .in('group_programme_id', blockProgrammeIds)
    if (progError) {
      console.error('[ParentBookings] programme sessions fetch failed:', progError)
    }
    for (const session of (progSessions ?? []) as (EnrolmentSessionRow & {
      group_programme_id: string
    })[]) {
      const list = sessionsByProgramme.get(session.group_programme_id) ?? []
      list.push(session)
      sessionsByProgramme.set(session.group_programme_id, list)
    }
  }

  // Venues: one read of the involved coaches' venues covers both the ids the
  // sessions/programme reference and the default-venue fallback (same
  // preference rule as the bookings block above).
  const coachIds = [
    ...new Set(
      enrolments
        .map((e) => firstOf(e.group_programmes)?.coach_profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const venueById = new Map<string, { name: string; address: string | null }>()
  const defaultVenueByCoach = new Map<string, { name: string; address: string | null }>()
  if (coachIds.length > 0) {
    const { data: venues } = await supabase
      .from('coach_venues')
      .select('id, coach_profile_id, name, address, is_default')
      .in('coach_profile_id', coachIds)
      .order('created_at', { ascending: true })
    for (const venue of venues ?? []) {
      venueById.set(venue.id, { name: venue.name, address: venue.address })
      const existing = defaultVenueByCoach.get(venue.coach_profile_id)
      if (!existing || venue.is_default) {
        defaultVenueByCoach.set(venue.coach_profile_id, {
          name: venue.name,
          address: venue.address,
        })
      }
    }
  }

  const items: ParentBookingItem[] = []
  for (const row of enrolments) {
    const programme = firstOf(row.group_programmes)
    if (!programme) {
      // RLS hides non-active programmes (see KNOWN LIMIT above) — without the
      // programme there is no coach, title or session list to render.
      console.error(
        '[ParentBookings] enrolment skipped — programme not readable (inactive?):',
        row.id,
      )
      continue
    }

    const allSessions =
      row.payment_model === 'block'
        ? (sessionsByProgramme.get(programme.id) ?? [])
        : (sessionsByEnrolment.get(row.id) ?? [])
    const sessions = allSessions
      .filter((s) => s.status !== 'cancelled')
      .sort((a, b) =>
        a.session_date === b.session_date
          ? a.start_time.localeCompare(b.start_time)
          : a.session_date.localeCompare(b.session_date),
      )
    const first = sessions[0]
    const last = sessions[sessions.length - 1]
    if (!first || !last) {
      console.error('[ParentBookings] enrolment skipped — no usable sessions:', row.id)
      continue
    }

    const coach = firstOf(programme.coach_profiles)
    const sport = firstOf(programme.sports)
    const child = firstOf(row.child_profiles)
    const coachName = coach?.display_name || 'Your coach'
    const sportName = sport?.name || 'Cricket'
    const participantName = child?.full_name || row.participant_name || ''

    const venueParts =
      (first.coach_venue_id ? venueById.get(first.coach_venue_id) : null) ??
      (programme.coach_venue_id ? venueById.get(programme.coach_venue_id) : null) ??
      defaultVenueByCoach.get(programme.coach_profile_id) ??
      null

    const status = enrolmentStatus(row.status)
    const isCancelled = status === 'cancelled_parent'

    items.push({
      id: row.id,
      reference: row.enrolment_reference ?? '',
      status,
      coachName,
      coachInitials: coachInitials(coachName),
      coachColour: childIdentityColour(stableColourIndex(programme.coach_profile_id)),
      sportName,
      sessionLine: `${sportName} · Programme · ${programme.title}`,
      whenLabel: formatProgrammeWhenLabel(
        sessions.length,
        first.session_date,
        last.session_date,
      ),
      shortWhenLabel: formatProgrammeShortWhenLabel(sessions.length, first.session_date),
      venueLabel: venueParts
        ? venueParts.address
          ? `${venueParts.name}, ${venueParts.address}`
          : venueParts.name
        : 'At your coach’s venue',
      participantLabel: firstNameOf(participantName) || 'your player',
      paidLabel: formatPaidLabel(
        row.parent_total_pence ?? row.block_amount_pence ?? 0,
        row.currency,
      ),
      paymentMethodLabel: PAYMENT_METHOD_FALLBACK,
      sessionStartMs: londonSessionToMs(first.session_date, first.start_time),
      sessionEndMs: londonSessionToMs(last.session_date, last.end_time),
      cancellationWindowHours: 0,
      allowsCancel: false, // enrolment cancellation is out of scope (later work)
      isCancelled,
      cancelledLine: isCancelled
        ? row.cancelled_at
          ? `This enrolment was cancelled on ${cancelledDayLabel(row.cancelled_at)}.`
          : 'This enrolment was cancelled.'
        : null,
      sessionDate: first.session_date,
      startTime: first.start_time,
      endTime: last.end_time,
      icsVenue: null,
      kind: 'programme',
      sessionDatesLine: sessions
        .map((s) => formatProgrammeDateLabel(s.session_date))
        .join(', '),
    })
  }
  return items
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
        coachColour: childIdentityColour(stableColourIndex(row.coach_profile_id)),
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
        paymentMethodLabel: PAYMENT_METHOD_FALLBACK,
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

    // PROGRAMME-BOOKINGS-LIST: programme enrolments ride alongside — the
    // bookings mapping above is untouched; the merge re-sorts explicitly
    // (identical order for bookings-only data — the query is already
    // date-ascending).
    const enrolmentItems = await loadEnrolmentItems(supabase, userProfile.id)
    const merged = [...items, ...enrolmentItems]

    // Upcoming = session not yet finished (ascending, soonest first);
    // Past = finished sessions, most recent first.
    return {
      upcoming: merged
        .filter((b) => b.sessionEndMs >= nowMs)
        .sort((a, b) => a.sessionStartMs - b.sessionStartMs),
      past: merged
        .filter((b) => b.sessionEndMs < nowMs)
        .sort((a, b) => b.sessionStartMs - a.sessionStartMs),
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
