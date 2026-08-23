// P-14 Phase 2 — POST /api/parent/bookings/[id]/cancel
//
// Parent-initiated cancellation of a confirmed booking, with the platform's
// FIRST programmatic Stripe refund (approved P-14 decision b: synchronous
// only — no new webhook event handlers).
//
// Business rules (BR-04/BR-05):
//   - The cancellation window is the booking row's OWN snapshot
//     (cancellation_window_hours, copied from the coach at checkout) — the
//     terms the parent agreed to. 0 = the coach allows no cancellations
//     (BUG-27 convention) → 403.
//   - Cancelling EARLIER than window_hours before the session start → full
//     refund of everything the parent paid (parent_total_pence — with
//     commission > 0 this is still the full charge, per BR-04 "full refund").
//   - Cancelling INSIDE the final window_hours → cancellation allowed, no
//     refund.
//   - A session that has already started cannot be cancelled.
//   - Window maths use the true Europe/London instant (BUG-66-safe).
//
// Failure ordering (approved): the Stripe refund runs BEFORE the booking
// update. If the refund fails, the booking is untouched and the client gets
// an error — nothing half-done. If a write fails AFTER the refund
// succeeded, the money is already with the parent (safe direction); we log
// loudly for ops and (for the booking-update failure) return 500 so the
// client re-checks state. Double-submits are safe twice over: a second
// request 409s on the status check, and the Stripe idempotency key
// (refund-booking-<id>) makes the refund itself single-fire.
//
// Security non-negotiables:
//   - Auth via the RLS-respecting server client (requireParentContext).
//   - Ownership is checked explicitly (booked_by_user_id) and misses return
//     404 — never 403 — so foreign booking ids can't be probed.
//   - Money reads/writes use the service-role client (payment_intents and
//     refunds are service-role-only by RLS design); amounts are integer
//     pence from the DB/Stripe, never from the client.
//   - Slot release is NOT done here: the migration-038 sync_booking_claim
//     trigger releases the coach_time_claims row when status leaves the
//     holding set.

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { requireParentContext } from '@/lib/auth/require-parent'
import { londonSessionToMs } from '@/lib/time/london'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOG = '[POST /api/parent/bookings/cancel]'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// UI select keys → the human-readable label stored in
// bookings.cancellation_reason (free text; the coach's BookingDetail renders
// it verbatim).
const REASON_LABELS: Record<string, string> = {
  plans: 'Change of plans',
  unwell: 'Child is unwell',
  conflict: 'Scheduling conflict',
  coach: 'Coach not responding',
  other: 'Other',
}

interface CancelInput {
  /** Human-readable reason label, or null when the parent picked none. */
  reasonLabel: string | null
}

/** Narrow the untrusted JSON body. Unknown reason keys are rejected. */
function parseBody(raw: unknown): CancelInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>
  if (b.reason === undefined || b.reason === null || b.reason === '') {
    return { reasonLabel: null }
  }
  if (typeof b.reason !== 'string') return null
  const label = REASON_LABELS[b.reason]
  if (!label) return null
  return { reasonLabel: label }
}

/** Stripe refund status → refunds table status ('pending'|'succeeded'|'failed'). */
function toRefundRowStatus(stripeStatus: string | null): 'pending' | 'succeeded' | 'failed' {
  if (stripeStatus === 'succeeded') return 'succeeded'
  if (stripeStatus === 'failed') return 'failed'
  // 'pending', 'requires_action', 'canceled' and unknowns stay 'pending' —
  // reconciliation is manual (refund policy B) until a status webhook lands.
  return 'pending'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // 1. Body — reason is optional but must be a known key when present.
  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // Empty body allowed — reason is optional.
  }
  const input = parseBody(body)
  if (!input) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  // 2. Auth — parent role via the RLS-respecting client.
  const rls = await createClient()
  const { context, error: authError } = await requireParentContext(rls)
  if (authError) return authError

  // Service-role client for everything below: payment_intents and refunds
  // are service-role-only by RLS design, and the bookings read/write stays
  // on the same client so the ownership check, refund and status flip all
  // see one consistent view (ownership is enforced explicitly in code —
  // 404 on any miss — matching the P-10 checkout route's pattern).
  const supabase = createAdminClient()

  // 3. Booking — must exist, be live, and belong to THIS user. Every miss is
  //    a 404 (no ownership oracle).
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(
      'id, booked_by_user_id, status, session_date, session_start_time, cancellation_window_hours',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (bookingError) {
    console.error(`${LOG} booking lookup failed:`, bookingError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
  if (!booking || booking.booked_by_user_id !== context.userProfile.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // 4. State machine — only a confirmed booking can be parent-cancelled.
  if (booking.status === 'cancelled_parent' || booking.status === 'cancelled_coach') {
    return NextResponse.json({ error: 'already_cancelled' }, { status: 409 })
  }
  if (booking.status !== 'confirmed') {
    return NextResponse.json({ error: 'not_cancellable' }, { status: 409 })
  }

  // 5. Timing — true London instant (BUG-66). Started sessions can't cancel,
  //    and that answer wins regardless of the coach's window setting.
  const nowMs = Date.now()
  const startMs = londonSessionToMs(booking.session_date, booking.session_start_time)
  if (nowMs >= startMs) {
    return NextResponse.json({ error: 'session_started' }, { status: 409 })
  }

  // 6. Policy — 0 = the coach allows no cancellations (BUG-27).
  const windowHours = booking.cancellation_window_hours
  if (windowHours <= 0) {
    return NextResponse.json({ error: 'cancellations_not_allowed' }, { status: 403 })
  }
  const refundEligible = nowMs <= startMs - windowHours * 3_600_000

  // 7. Refund — only when cancelling earlier than the window cutoff.
  let refunded = false
  let refundAmountPence = 0
  let refundRowStatus: 'pending' | 'succeeded' | 'failed' | null = null

  if (refundEligible) {
    const { data: pi, error: piError } = await supabase
      .from('payment_intents')
      .select('id, stripe_payment_intent_id, amount_pence, currency')
      .eq('booking_id', booking.id)
      .eq('status', 'succeeded')
      .maybeSingle()

    if (piError || !pi) {
      // A confirmed booking with no succeeded intent is a data anomaly —
      // fail closed (booking untouched) and surface for ops.
      console.error(
        `${LOG} MANUAL ATTENTION: no succeeded payment_intent for confirmed booking ${booking.id} — cancel blocked:`,
        piError ?? 'no row',
      )
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }

    // Full refund: no amount param = the entire charge (BR-04). The Stripe
    // idempotency key pins this booking to at most ONE refund forever.
    let refund: Stripe.Refund
    try {
      refund = await getStripe().refunds.create(
        { payment_intent: pi.stripe_payment_intent_id },
        { idempotencyKey: `refund-booking-${booking.id}` },
      )
    } catch (err) {
      console.error(`${LOG} Stripe refund failed for booking ${booking.id}:`, err)
      return NextResponse.json({ error: 'refund_failed' }, { status: 502 })
    }

    refundAmountPence = refund.amount
    refundRowStatus = toRefundRowStatus(refund.status)

    // Audit row (service-role-only table) — recorded for EVERY outcome,
    // including a synchronously-failed refund. An insert failure must not
    // strand the parent once money has moved, so log loudly and carry on.
    const { error: refundRowError } = await supabase.from('refunds').insert({
      booking_id: booking.id,
      payment_intent_id: pi.id,
      stripe_refund_id: refund.id,
      amount_pence: refund.amount,
      currency: (refund.currency || pi.currency || 'GBP').toUpperCase(),
      reason: 'parent_cancelled_before_window',
      status: refundRowStatus,
      initiated_by: 'parent',
      ...(refundRowStatus === 'succeeded'
        ? { processed_at: new Date().toISOString() }
        : {}),
    })
    if (refundRowError) {
      console.error(
        `${LOG} MANUAL ATTENTION: refunds audit insert failed for Stripe refund ${refund.id} (status ${refundRowStatus}) on booking ${booking.id}:`,
        refundRowError,
      )
    }

    // A refund that RESOLVED with status 'failed' moved no money — fail
    // closed exactly like the thrown-error path: booking untouched, slot
    // kept, payment_intents untouched. (The audit row above records the
    // failed attempt.)
    if (refundRowStatus === 'failed') {
      console.error(
        `${LOG} MANUAL ATTENTION: Stripe refund ${refund.id} for booking ${booking.id} resolved with status 'failed' — booking left untouched`,
      )
      return NextResponse.json({ error: 'refund_failed' }, { status: 502 })
    }

    refunded = true

    // Reflect the refund on the intent ONLY once Stripe confirms it
    // succeeded; a 'pending' refund leaves the intent as-is until manual
    // reconciliation (refund policy B — audit truth is Stripe).
    if (refundRowStatus === 'succeeded') {
      const { error: piUpdateError } = await supabase
        .from('payment_intents')
        .update({ status: 'refunded' })
        .eq('id', pi.id)
      if (piUpdateError) {
        console.error(
          `${LOG} MANUAL ATTENTION: payment_intents status update failed AFTER Stripe refund ${refund.id} for booking ${booking.id}:`,
          piUpdateError,
        )
      }
    }
  }

  // 8. Flip the booking. The migration-038 trigger releases the slot claim.
  //    The status guard + row-count check make this an optimistic-concurrency
  //    write: a concurrent double-submit's loser matches zero rows and gets a
  //    409 (money stays single-fire either way — the Stripe idempotency key
  //    returns the same refund object to both requests).
  const { data: updatedRow, error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled_parent',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'parent',
      cancellation_reason: input.reasonLabel,
    })
    .eq('id', booking.id)
    .eq('status', 'confirmed')
    .select('id')
    .maybeSingle()

  if (updateError) {
    if (refunded) {
      console.error(
        `${LOG} MANUAL ATTENTION: booking ${booking.id} refunded but status update failed — booking still confirmed:`,
        updateError,
      )
    } else {
      console.error(`${LOG} booking update failed for ${booking.id}:`, updateError)
    }
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
  if (!updatedRow) {
    // Race loser: another request (or the coach) changed the status between
    // our read and this write. The booking is no longer 'confirmed', so the
    // winning path owns the outcome — report the conflict.
    console.error(
      `${LOG} booking ${booking.id} status changed concurrently — update matched no rows (refunded=${refunded})`,
    )
    return NextResponse.json({ error: 'already_cancelled' }, { status: 409 })
  }

  return NextResponse.json({
    status: 'cancelled',
    refunded,
    refundAmountPence,
    refundStatus: refundRowStatus,
  })
}
