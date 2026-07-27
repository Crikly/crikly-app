import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'
import { requireCoachContext } from '@/lib/auth/require-coach'

type PayoutRow = Database['public']['Tables']['payouts']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']

// ─── Types ────────────────────────────────────────────────────────────────────

interface EarningsSummary {
  total_earned_pence: number
  pending_pence: number
  this_month_pence: number
  last_month_pence: number
  // C-PAY-06: gross value of completed sessions still inside the BR-03 hold
  // window (no active payout row yet). Gross because the Stripe fee is only
  // known at transfer time (BR-02).
  in_clearance_pence: number
  currency: 'GBP'
}

interface PayoutItem {
  id: string
  booking_id: string
  booking_reference: string | null
  session_date: string | null
  session_type: string | null
  // C-PAY-05: gross session price. The Stripe fee is not stored anywhere —
  // C-PAY-02 writes amount_pence = coach_price_pence − actual fee, so the UI
  // derives fee = coach_price_pence − amount_pence.
  coach_price_pence: number | null
  amount_pence: number
  currency: string
  status: string
  scheduled_at: string
  processed_at: string | null
}

// C-PAY-06: one unified list covering every completed session's money —
// bookings still clearing (no payout row) and payout rows in every state.
export type TransactionStatus =
  | 'in_clearance'
  | 'transferring'
  | 'paid'
  | 'failed'
  | 'on_hold'

interface TransactionItem {
  id: string
  status: TransactionStatus
  session_date: string | null
  booking_reference: string | null
  participant_name: string
  coach_price_pence: number | null
  fee_pence: number | null
  net_pence: number
  // BR-10: every money-bearing shape carries its ISO currency code
  currency: string
  payout_eligible_at: string | null
  scheduled_at: string | null
  processed_at: string | null
  held_reason: string | null
  failure_reason: string | null
}

// Embedded participant joins. player_profiles carries no name of its own —
// the player's name lives on user_profiles (via user_profile_id), and coach
// RLS may block that path entirely (own-record-only policy), in which case
// the embed is null and the coalesce falls through to the migration-035
// participant_name snapshot.
interface ParticipantSource {
  participant_name: string | null
  child_profiles: { full_name: string | null } | null
  player_profiles: { user_profiles: { full_name: string | null } | null } | null
}

type ClearanceBookingRow = Pick<
  BookingRow,
  'id' | 'booking_reference' | 'session_date' | 'coach_price_pence' | 'payout_eligible_at' | 'currency'
> &
  ParticipantSource

type HistoryBooking = Pick<
  BookingRow,
  | 'booking_reference'
  | 'session_date'
  | 'session_type'
  | 'coach_price_pence'
  | 'payout_eligible_at'
> &
  ParticipantSource

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toISOString()
}

function computeSummary(payouts: PayoutRow[], inClearancePence: number): EarningsSummary {
  const now = new Date()
  const thisMonthStart = firstOfMonth(now.getUTCFullYear(), now.getUTCMonth())
  const lastMonthStart = firstOfMonth(now.getUTCFullYear(), now.getUTCMonth() - 1)

  let total_earned_pence = 0
  let pending_pence = 0
  let this_month_pence = 0
  let last_month_pence = 0

  for (const p of payouts) {
    if (p.status === 'paid') {
      total_earned_pence += p.amount_pence

      if (p.processed_at) {
        if (p.processed_at >= thisMonthStart) {
          this_month_pence += p.amount_pence
        } else if (p.processed_at >= lastMonthStart && p.processed_at < thisMonthStart) {
          last_month_pence += p.amount_pence
        }
      }
    } else if (p.status === 'pending' || p.status === 'processing') {
      pending_pence += p.amount_pence
    }
  }

  return {
    total_earned_pence,
    pending_pence,
    this_month_pence,
    last_month_pence,
    in_clearance_pence: inClearancePence,
    currency: 'GBP',
  }
}

function resolveParticipantName(source: ParticipantSource): string {
  return (
    source.child_profiles?.full_name ??
    source.player_profiles?.user_profiles?.full_name ??
    source.participant_name ??
    'Player'
  )
}

// Maps a payouts.status onto the UI transaction status. 'pending' rows are
// past the clearance window with the transfer imminent (C-PAY-02 fires on the
// next hourly run), so they read as money in motion, same as 'processing'.
function toTransactionStatus(payoutStatus: string): TransactionStatus {
  switch (payoutStatus) {
    case 'paid':
      return 'paid'
    case 'failed':
      return 'failed'
    case 'held':
      return 'on_hold'
    default:
      return 'transferring'
  }
}

// Newest session first; rows with no booking (orphan payouts) sink to the end.
function bySessionDateDesc(a: TransactionItem, b: TransactionItem): number {
  if (a.session_date === b.session_date) return 0
  if (a.session_date === null) return 1
  if (b.session_date === null) return -1
  return b.session_date.localeCompare(a.session_date)
}

const PARTICIPANT_EMBED =
  'participant_name, child_profiles(full_name), player_profiles(user_profiles(full_name))'

// ─── GET /api/coaches/earnings ────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()

  const { context, error } = await requireCoachContext(supabase)
  if (error) return error
  const { coachProfile } = context

  const nowIso = new Date().toISOString()

  const [payoutsRes, clearanceRes] = await Promise.all([
    // All payouts for this coach (needed for accurate all-time and monthly sums)
    supabase
      .from('payouts')
      .select(
        'id, booking_id, amount_pence, currency, status, scheduled_at, processed_at, held_reason, failure_reason',
      )
      .eq('coach_profile_id', coachProfile.id)
      .order('scheduled_at', { ascending: false }),
    // C-PAY-06: in-clearance bookings — completed, still inside the BR-03
    // hold, and not already owned by an active payout row. Same PostgREST
    // anti-join as the C-PAY-02 discovery query: left-embed payouts filtered
    // to active statuses, then require the embed empty. pending/failed rows
    // are deliberately NOT excluded here — they only exist once the hold has
    // passed, so the payout_eligible_at > now() filter already keeps those
    // bookings out and they surface via their payout row instead.
    //
    // Known gap (accepted): a booking whose payout_eligible_at has just
    // passed but whose hourly C-PAY-02 run hasn't fired yet matches neither
    // query — no payout row exists and it is no longer "> now()". That
    // session is invisible here for up to ~1 hour, then self-heals when the
    // cron writes its payout row.
    supabase
      .from('bookings')
      .select(
        `id, booking_reference, session_date, coach_price_pence, currency, payout_eligible_at, ${PARTICIPANT_EMBED}, payouts!left(id)`,
      )
      .eq('coach_profile_id', coachProfile.id)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .gt('payout_eligible_at', nowIso)
      .in('payouts.status', ['processing', 'paid', 'held'])
      .is('payouts', null)
      .order('session_date', { ascending: false })
      .limit(50),
  ])

  if (payoutsRes.error || clearanceRes.error) {
    return NextResponse.json({ error: 'Failed to fetch earnings' }, { status: 500 })
  }

  const allPayouts = (payoutsRes.data ?? []) as PayoutRow[]
  const clearanceBookings = (clearanceRes.data ?? []) as unknown as ClearanceBookingRow[]

  const inClearancePence = clearanceBookings.reduce((sum, b) => sum + b.coach_price_pence, 0)
  const summary = computeSummary(allPayouts, inClearancePence)

  // Build history slice (max 50) and batch-fetch booking details (Fix-16d)
  const historyRows = allPayouts.slice(0, 50)
  const bookingIds = historyRows.map((p) => p.booking_id)

  const bookingMap: Record<string, HistoryBooking> = {}

  if (bookingIds.length > 0) {
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(
        `id, booking_reference, session_date, session_type, coach_price_pence, payout_eligible_at, ${PARTICIPANT_EMBED}`,
      )
      .in('id', bookingIds)

    if (bookingsError) {
      return NextResponse.json({ error: 'Failed to fetch booking details' }, { status: 500 })
    }

    ;((bookings ?? []) as unknown as Array<HistoryBooking & { id: string }>).forEach((b) => {
      bookingMap[b.id] = b
    })
  }

  // Assemble payout history items (shape unchanged — C-PAY-05 contract)
  const payoutItems: PayoutItem[] = historyRows.map((p) => {
    const booking = bookingMap[p.booking_id] ?? null
    return {
      id: p.id,
      booking_id: p.booking_id,
      booking_reference: booking?.booking_reference ?? null,
      session_date: booking?.session_date ?? null,
      session_type: booking?.session_type ?? null,
      coach_price_pence: booking?.coach_price_pence ?? null,
      amount_pence: p.amount_pence,
      currency: p.currency,
      status: p.status,
      scheduled_at: p.scheduled_at,
      processed_at: p.processed_at,
    }
  })

  // C-PAY-06: unified transactions — in-clearance bookings carry the gross
  // price (fee unknown until transfer), payout rows carry the real net.
  const clearanceTransactions: TransactionItem[] = clearanceBookings.map((b) => ({
    id: b.id,
    status: 'in_clearance',
    session_date: b.session_date,
    booking_reference: b.booking_reference,
    participant_name: resolveParticipantName(b),
    coach_price_pence: b.coach_price_pence,
    fee_pence: null,
    net_pence: b.coach_price_pence,
    currency: b.currency,
    payout_eligible_at: b.payout_eligible_at,
    scheduled_at: null,
    processed_at: null,
    held_reason: null,
    failure_reason: null,
  }))

  const payoutTransactions: TransactionItem[] = historyRows.map((p) => {
    const booking = bookingMap[p.booking_id] ?? null
    const gross = booking?.coach_price_pence ?? null
    const fee = gross !== null && gross - p.amount_pence >= 0 ? gross - p.amount_pence : null
    return {
      id: p.id,
      status: toTransactionStatus(p.status),
      session_date: booking?.session_date ?? null,
      booking_reference: booking?.booking_reference ?? null,
      participant_name: booking ? resolveParticipantName(booking) : 'Player',
      coach_price_pence: gross,
      fee_pence: fee,
      net_pence: p.amount_pence,
      currency: p.currency,
      payout_eligible_at: booking?.payout_eligible_at ?? null,
      scheduled_at: p.scheduled_at,
      processed_at: p.processed_at,
      held_reason: p.held_reason,
      failure_reason: p.failure_reason,
    }
  })

  const transactions = [...clearanceTransactions, ...payoutTransactions].sort(bySessionDateDesc)

  return NextResponse.json({ summary, payouts: payoutItems, transactions })
}
