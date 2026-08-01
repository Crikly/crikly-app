import { getStripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'

// P-04-B: server-only guest→account matching. A guest's email exists
// NOWHERE in the database by design (P-00c-EMAIL) — it lives solely in
// Stripe PaymentIntent metadata (guest_email), stashed by the guest
// checkout routes. Matching therefore goes:
//
//   verified session email → Stripe Search (metadata guest_email,
//   status succeeded) → cross-check every hit against our
//   payment_intents audit table (only PIs we recorded are trusted) →
//   service-role fetch of the bookings/enrolments still owned by live
//   provisional profiles.
//
// SECURITY: callers must pass the email from the AUTHENTICATED session
// (supabase.auth.getUser().email) — never client-supplied input. The
// admin client is required because RLS (auth.uid() = auth_user_id) makes
// provisional rows invisible to every ordinary client by design.

export interface GuestBookingMatch {
  id: string
  kind: 'booking' | 'enrolment'
  coachName: string
  /** ISO date (YYYY-MM-DD) of the session / programme start, if known. */
  sessionDate: string | null
  venueName: string | null
  /** Display-only pence — never store back. */
  amountPaidPence: number
}

export interface GuestLinkScan {
  matches: GuestBookingMatch[]
  provisionalProfileIds: string[]
}

const EMPTY_SCAN: GuestLinkScan = { matches: [], provisionalProfileIds: [] }

// Supabase nested joins may return object or array depending on inferred
// cardinality (same normalisation as coach/dashboard/page.tsx).
function firstOf<T>(value: T | T[] | null): T | null {
  if (value === null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export async function findGuestBookings(email: string): Promise<GuestLinkScan> {
  // Stripe Search values are single-quoted; strip quotes, backslashes and
  // whitespace rather than attempt escaping — none are valid in a
  // deliverable address, and stripping guarantees no quote breakout.
  const cleanEmail = email.trim().toLowerCase().replace(/['"\\\s]/g, '')
  if (!cleanEmail) return EMPTY_SCAN

  const stripe = getStripe()
  const search = await stripe.paymentIntents.search({
    query: `metadata['guest_email']:'${cleanEmail}' AND status:'succeeded'`,
    limit: 100,
  })
  if (search.data.length === 0) return EMPTY_SCAN

  const piIds = search.data.map((pi) => pi.id)
  const supabase = createAdminClient()

  // Cross-check: only PaymentIntents recorded in our own audit table are
  // trusted — a PI id from Stripe search that we never wrote is ignored.
  const { data: auditRows, error: auditError } = await supabase
    .from('payment_intents')
    .select('stripe_payment_intent_id, booking_id, enrolment_id')
    .in('stripe_payment_intent_id', piIds)
  if (auditError) throw auditError

  const bookingIds = (auditRows ?? [])
    .map((row) => row.booking_id)
    .filter((id): id is string => id !== null)
  const enrolmentIds = (auditRows ?? [])
    .map((row) => row.enrolment_id)
    .filter((id): id is string => id !== null)

  if (bookingIds.length === 0 && enrolmentIds.length === 0) return EMPTY_SCAN

  const [bookingsResult, enrolmentsResult] = await Promise.all([
    bookingIds.length > 0
      ? supabase
          .from('bookings')
          .select(
            'id, booked_by_user_id, session_date, venue_name, parent_total_pence, coach_profiles ( display_name )',
          )
          .in('id', bookingIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    enrolmentIds.length > 0
      ? supabase
          .from('group_programme_enrolments')
          .select(
            'id, booked_by_user_id, parent_total_pence, block_amount_pence, group_programmes ( title, venue_name, starts_at, coach_profiles ( display_name ) )',
          )
          .in('id', enrolmentIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (bookingsResult.error) throw bookingsResult.error
  if (enrolmentsResult.error) throw enrolmentsResult.error

  const bookings = bookingsResult.data ?? []
  const enrolments = enrolmentsResult.data ?? []

  // Only records still owned by a LIVE provisional guest profile qualify —
  // anything already linked, cancelled-and-reaped, or belonging to a real
  // account is excluded.
  const ownerIds = [
    ...new Set(
      [...bookings, ...enrolments].map((row) => row.booked_by_user_id),
    ),
  ]
  if (ownerIds.length === 0) return EMPTY_SCAN

  const { data: provisionalProfiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id')
    .in('id', ownerIds)
    .eq('is_provisional', true)
    .is('auth_user_id', null)
    .is('deleted_at', null)
  if (profilesError) throw profilesError

  const provisionalIds = new Set((provisionalProfiles ?? []).map((p) => p.id))
  if (provisionalIds.size === 0) return EMPTY_SCAN

  const matches: GuestBookingMatch[] = [
    ...bookings
      .filter((booking) => provisionalIds.has(booking.booked_by_user_id))
      .map((booking): GuestBookingMatch => {
        const coach = firstOf(booking.coach_profiles)
        return {
          id: booking.id,
          kind: 'booking',
          coachName: coach?.display_name || 'Coach',
          sessionDate: booking.session_date,
          venueName: booking.venue_name,
          amountPaidPence: booking.parent_total_pence ?? 0,
        }
      }),
    ...enrolments
      .filter((enrolment) => provisionalIds.has(enrolment.booked_by_user_id))
      .map((enrolment): GuestBookingMatch => {
        const programme = firstOf(enrolment.group_programmes)
        const coach = programme ? firstOf(programme.coach_profiles) : null
        return {
          id: enrolment.id,
          kind: 'enrolment',
          coachName: coach?.display_name || 'Coach',
          sessionDate: programme?.starts_at
            ? (programme.starts_at.split('T')[0] ?? null)
            : null,
          venueName: programme?.venue_name ?? null,
          amountPaidPence:
            enrolment.parent_total_pence ?? enrolment.block_amount_pence ?? 0,
        }
      }),
  ].sort((a, b) => (b.sessionDate ?? '').localeCompare(a.sessionDate ?? ''))

  return { matches, provisionalProfileIds: [...provisionalIds] }
}
