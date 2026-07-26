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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toISOString()
}

function computeSummary(payouts: PayoutRow[]): EarningsSummary {
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

  return { total_earned_pence, pending_pence, this_month_pence, last_month_pence, currency: 'GBP' }
}

// ─── GET /api/coaches/earnings ────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()

  const { context, error } = await requireCoachContext(supabase)
  if (error) return error
  const { coachProfile } = context

  // 5. Fetch all payouts for this coach (needed for accurate all-time and monthly sums)
  const { data: payouts, error: payoutsError } = await supabase
    .from('payouts')
    .select('id, booking_id, amount_pence, currency, status, scheduled_at, processed_at')
    .eq('coach_profile_id', coachProfile.id)
    .order('scheduled_at', { ascending: false })

  if (payoutsError) {
    return NextResponse.json({ error: 'Failed to fetch earnings' }, { status: 500 })
  }

  const allPayouts = (payouts ?? []) as PayoutRow[]

  // 6. Compute summary from all payout rows
  const summary = computeSummary(allPayouts)

  // 7. Build history slice (max 50) and batch-fetch booking details (Fix-16d)
  const historyRows = allPayouts.slice(0, 50)
  const bookingIds = historyRows.map((p) => p.booking_id)

  const bookingMap: Record<
    string,
    Pick<BookingRow, 'booking_reference' | 'session_date' | 'session_type' | 'coach_price_pence'>
  > = {}

  if (bookingIds.length > 0) {
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, booking_reference, session_date, session_type, coach_price_pence')
      .in('id', bookingIds)

    if (bookingsError) {
      return NextResponse.json({ error: 'Failed to fetch booking details' }, { status: 500 })
    }

    ;(bookings ?? []).forEach((b) => {
      bookingMap[b.id] = {
        booking_reference: b.booking_reference,
        session_date: b.session_date,
        session_type: b.session_type,
        coach_price_pence: b.coach_price_pence,
      }
    })
  }

  // 8. Assemble payout history items
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

  return NextResponse.json({ summary, payouts: payoutItems })
}
