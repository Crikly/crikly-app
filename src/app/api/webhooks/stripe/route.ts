// BUG-STRIPE-ONBOARDING-COMPLETE-WIRING: Stripe webhook receiver.
//
// Single responsibility right now: persist `coach_profiles.stripe_onboarding_complete`
// when Stripe sends an `account.updated` event. Every other event type is
// acknowledged with 200 and ignored — Stripe retries on non-2xx, so unknown
// types MUST return 200 or we self-DoS.
//
// Security non-negotiables (docs/06_SECURITY_COMPLIANCE.md §Payment Security):
//   - Verify the signature BEFORE touching the payload.
//   - Verify against the raw request body — request.text() not request.json().
//   - Use STRIPE_WEBHOOK_SECRET, never the API secret.
//   - Reject with 400 on signature failure (Stripe Dashboard surfaces the rejection).
//
// Runtime: Node.js (Stripe SDK isn't edge-safe). `force-dynamic` so Next.js
// doesn't try to cache or pre-render this route.
//
// Handled events:
//   - account.updated                 → coach Connect onboarding status
//   - payment_intent.succeeded        → confirm guest booking (P-00c-API)
//   - payment_intent.payment_failed   → record payment failure (P-00c-API)
//
// Idempotency: each handler is self-guarding rather than relying on a shared
// audit table. account.updated writes an idempotent boolean; the booking confirm
// is scoped to status='pending_payment' so redelivery is a no-op; the PI audit
// updates are state-convergent. A `stripe_webhook_events` table keyed on event.id
// is the next hardening step if we add non-idempotent side effects.
//
// Follow-ups:
//   - TODO(P-00c-EMAIL): send the Resend confirmation inside the booking-confirm
//     transition (single-fire is already guaranteed by the pending_payment guard).
//   - Add `account.application.deauthorized` so a revoked Connect account flips
//     stripe_onboarding_complete back to false.

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/stripe
 *
 * Verifies the Stripe signature, dispatches the event, and ALWAYS returns 200
 * once the signature has passed (even on DB error — never trigger Stripe
 * retry loops). Returns 400 on signature failure and 500 only if the webhook
 * signing secret is unconfigured.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Pull the signing secret. Crash early at request time if missing rather
  //    than at module load — the route is rarely exercised, so a misconfigured
  //    env should surface as a clear 500 on the first webhook, not a build error.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // Stripe client is lazy-initialised (see lib/stripe/client.ts) so the module
  // import never crashes the build. Surface a missing API key as a clear 500
  // here at request time rather than an unhandled throw.
  let stripe: Stripe
  try {
    stripe = getStripe()
  } catch (err) {
    console.error('[Stripe Webhook]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // 2. Read the raw body. Signature verification MUST run against the bytes
  //    Stripe sent, not a re-serialised JSON object — request.text() preserves
  //    them exactly. NEVER replace this with request.json().
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch (err) {
    console.error('[Stripe Webhook] Failed to read raw body:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // 3. Pull the signature from the canonical Stripe header.
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    console.error('[Stripe Webhook] Missing stripe-signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // 4. Verify. Any failure here means we did NOT get a real Stripe event
  //    (replay, forgery, secret rotation in flight) — reject and let Stripe
  //    Dashboard surface it.
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('[Stripe Webhook] Signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // 5. Dispatch. Wrapped in a catch-all so DB / handler errors don't propagate
  //    as 5xx — Stripe retries on any non-2xx and we MUST NOT induce loops.
  try {
    switch (event.type) {
      case 'account.updated':
        // account.updated always carries a Stripe.Account object per Stripe's API
        // contract. The cast is safe; future event types must verify their own.
        await handleAccountUpdated(event.data.object as Stripe.Account)
        break

      case 'payment_intent.succeeded':
        // Guest checkout (P-00c-API): payment cleared → confirm the booking.
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
        break

      case 'payment_intent.payment_failed':
        // Mark the payment_intents row failed so we don't leave it stuck at
        // 'pending'. The booking stays 'pending_payment' and is reaped by the
        // provisional-user cleanup cron (guest) or retried by the payer.
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent)
        break

      default:
        // Stripe sends many event types we don't subscribe to here. Acknowledge
        // and move on — silence is correct. console.info gives ops visibility
        // into what's arriving so we can subscribe selectively in Stripe Dashboard.
        console.info(`[Stripe Webhook] Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    // Handler-level catch-all. Per the task brief: NEVER let DB errors cause
    // retry loops. Log and return 200 so Stripe stops retrying.
    console.error(`[Stripe Webhook] Handler threw for event ${event.type}:`, err)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}

/**
 * account.updated — coach's Stripe Connect account state changed.
 *
 * Writes `coach_profiles.stripe_onboarding_complete = (charges_enabled && payouts_enabled)`.
 * Handles both directions: true when both flags are true, false when either is false
 * (Stripe revoking a capability flips the flag back as a safety net).
 *
 * Failure modes never throw — DB errors are logged and swallowed so the outer
 * webhook handler returns 200 to Stripe.
 */
async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  const isComplete = account.charges_enabled === true && account.payouts_enabled === true

  const adminSupabase = createAdminClient()
  const { data: rows, error: updateError } = await adminSupabase
    .from('coach_profiles')
    .update({ stripe_onboarding_complete: isComplete })
    .eq('stripe_account_id', account.id)
    .select('id')

  if (updateError) {
    // DB error during an otherwise valid event. Log and let the outer handler
    // return 200 — never retry-loop. Coach UI continues to poll Stripe directly
    // (see /api/payments/connect/onboard) until the next account.updated event
    // lands.
    console.error(
      `[Stripe Webhook] account.updated DB update failed for ${account.id}:`,
      updateError,
    )
    return
  }

  if (!rows || rows.length === 0) {
    // No coach in this DB has that Stripe account. Plausible: different
    // environment (test event hitting live, vice versa), coach soft-deleted
    // after onboarding, or a fresh local DB. NOT an error — log info and move on.
    console.info(
      `[Stripe Webhook] account.updated: no coach found with stripe_account_id=${account.id}`,
    )
    return
  }

  console.info(
    `[Stripe Webhook] account.updated: ${rows.length} coach row(s) set stripe_onboarding_complete=${isComplete} for ${account.id}`,
  )
}

/**
 * payment_intent.succeeded — the guest's card cleared.
 *
 * Confirms the booking (BR-06 instant confirmation) and unlocks messaging
 * (BR-07), and marks the payment_intents audit row succeeded.
 *
 * Idempotency: Stripe may deliver this event more than once. We only act when
 * the booking is still 'pending_payment', so a redelivery is a no-op. We also
 * scope the booking UPDATE to status='pending_payment' so concurrent deliveries
 * cannot double-fire side effects (e.g. the confirmation email).
 *
 * Never throws — DB errors are logged and swallowed so the outer handler returns
 * 200 and Stripe stops retrying.
 */
async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
  const bookingId = intent.metadata?.booking_id
  if (!bookingId) {
    // Not a Crikly-originated intent (or metadata missing). Nothing to do.
    console.info(`[Stripe Webhook] payment_intent.succeeded ${intent.id} has no booking_id metadata`)
    return
  }

  const adminSupabase = createAdminClient()

  // Always reconcile the audit row to the terminal success state.
  const { error: piError } = await adminSupabase
    .from('payment_intents')
    .update({ status: 'succeeded', stripe_status: intent.status })
    .eq('stripe_payment_intent_id', intent.id)

  if (piError) {
    console.error(`[Stripe Webhook] payment_intents update failed for ${intent.id}:`, piError)
  }

  // Confirm the booking only if still awaiting payment — this is the idempotency
  // guard. .select() lets us tell whether THIS delivery did the transition.
  const { data: confirmed, error: bookingError } = await adminSupabase
    .from('bookings')
    .update({ status: 'confirmed', messaging_unlocked: true })
    .eq('id', bookingId)
    .eq('status', 'pending_payment')
    .select('id, booking_reference')

  if (bookingError) {
    console.error(`[Stripe Webhook] booking confirm failed for ${bookingId}:`, bookingError)
    return
  }

  if (!confirmed || confirmed.length === 0) {
    // Already confirmed by a prior delivery (or cancelled). No-op — correct.
    console.info(`[Stripe Webhook] booking ${bookingId} not in pending_payment; skipping (idempotent)`)
    return
  }

  // TODO(P-00c-EMAIL): trigger the Resend booking-confirmation email here, using
  // confirmed[0].booking_reference. Guarded by the pending_payment transition
  // above so it fires exactly once.
  console.info(`[Stripe Webhook] booking ${bookingId} confirmed via ${intent.id}`)
}

/**
 * payment_intent.payment_failed — the card was declined / authentication failed.
 *
 * Records the failure on the payment_intents audit row (including Stripe's error
 * code/message for support). The booking is intentionally left 'pending_payment'
 * so the payer can retry against the same intent; abandoned rows are reaped by
 * the provisional-user cleanup cron. Never throws.
 */
async function handlePaymentIntentFailed(intent: Stripe.PaymentIntent): Promise<void> {
  const lastError = intent.last_payment_error
  const adminSupabase = createAdminClient()

  const { error } = await adminSupabase
    .from('payment_intents')
    .update({
      status: 'failed',
      stripe_status: intent.status,
      stripe_error_code: lastError?.code ?? null,
      stripe_error_message: lastError?.message ?? null,
    })
    .eq('stripe_payment_intent_id', intent.id)

  if (error) {
    console.error(`[Stripe Webhook] payment_intents failure update failed for ${intent.id}:`, error)
    return
  }

  console.info(`[Stripe Webhook] payment_intent.payment_failed recorded for ${intent.id}`)
}
