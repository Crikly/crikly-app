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
// Booking-confirmation email (P-00c-EMAIL) is sent inside the booking-confirm
// transition — single-fire is guaranteed by the pending_payment guard, and email
// failure never affects the 200 response (sendBookingConfirmation never throws).
//
// Follow-ups:
//   - Add `account.application.deauthorized` so a revoked Connect account flips
//     stripe_onboarding_complete back to false.

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBookingConfirmation } from '@/lib/resend/send-booking-confirmation'
import { sendProgrammeConfirmation } from '@/lib/resend/send-programme-confirmation'
import { addMinutesToTime } from '@/lib/booking/guest-checkout'

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
  // Programme enrolment (P-00c-ENROL) and 1-to-1 booking (P-00c-API) intents are
  // distinguished purely by metadata. Enrolment intents carry enrolment_id;
  // booking intents carry booking_id. Branch first, keep the two flows isolated.
  const enrolmentId = intent.metadata?.enrolment_id
  if (enrolmentId) {
    await handleEnrolmentSucceeded(intent, enrolmentId)
    return
  }

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
    .select(
      'id, booking_reference, coach_profile_id, session_date, session_start_time, session_end_time, session_type',
    )

  if (bookingError) {
    console.error(`[Stripe Webhook] booking confirm failed for ${bookingId}:`, bookingError)
    return
  }

  if (!confirmed || confirmed.length === 0) {
    // Already confirmed by a prior delivery (or cancelled). No-op — correct.
    console.info(`[Stripe Webhook] booking ${bookingId} not in pending_payment; skipping (idempotent)`)
    return
  }

  console.info(`[Stripe Webhook] booking ${bookingId} confirmed via ${intent.id}`)

  // Booking-confirmation email (P-00c-EMAIL). Fires exactly once — gated by the
  // pending_payment transition above. The guest has no account and no stored
  // email, so the address + name come from the intent metadata stashed at
  // creation by /api/guest/bookings. Email failure NEVER affects the webhook
  // response: sendBookingConfirmation swallows and returns a boolean.
  const booking = confirmed[0]
  const guestEmail = intent.metadata?.guest_email
  const guestName = intent.metadata?.guest_name
  // UX-16: who the session is for, stashed at intent creation. Absent on
  // intents created before UX-16 — the email then omits its "Booking for" row.
  const participantName = intent.metadata?.participant_name || undefined
  const participantAgeRaw = Number.parseInt(intent.metadata?.participant_age ?? '', 10)
  const participantAge = Number.isInteger(participantAgeRaw) ? participantAgeRaw : undefined

  if (!guestEmail) {
    // No recipient (non-guest intent, or an older intent created before this
    // metadata existed). Booking is confirmed; silently skip the email — this is
    // a normal path, not an error worth logging.
    return
  }

  // Coach display name: prefer coach_profiles.display_name, fall back to the
  // coach's user_profiles.full_name.
  let coachName = 'your coach'
  const { data: coach } = await adminSupabase
    .from('coach_profiles')
    .select('display_name, user_profile_id')
    .eq('id', booking.coach_profile_id)
    .maybeSingle()

  if (coach?.display_name) {
    coachName = coach.display_name
  } else if (coach?.user_profile_id) {
    const { data: coachUser } = await adminSupabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', coach.user_profile_id)
      .maybeSingle()
    if (coachUser?.full_name) coachName = coachUser.full_name
  }

  const sent = await sendBookingConfirmation({
    guestName: guestName || 'there',
    guestEmail,
    coachName,
    participantName,
    participantAge,
    bookingReference: booking.booking_reference,
    sessionDate: formatSessionDate(booking.session_date),
    sessionTime: formatSessionTime(booking.session_start_time, booking.session_end_time),
    sessionType: formatSessionType(booking.session_type),
    // intent.amount is the canonical amount actually charged, in pence.
    totalPence: intent.amount,
  })

  if (!sent) {
    console.error(`[Stripe Webhook] confirmation email failed for booking ${bookingId}`)
  }
}

/**
 * payment_intent.succeeded for a GUEST PROGRAMME ENROLMENT (P-00c-ENROL).
 *
 * Mirrors the booking confirm: flips payment_status 'pending' → 'succeeded'
 * (idempotency guard scopes the UPDATE to 'pending'), then atomically claims a
 * programme spot via increment_programme_spots(). If the programme filled between
 * checkout and confirmation (RPC returns false), we log loudly for a manual
 * refund (S0 decision 3) — the payment already cleared. Sends the enrolment
 * confirmation email from the intent metadata. Never throws.
 */
async function handleEnrolmentSucceeded(intent: Stripe.PaymentIntent, enrolmentId: string): Promise<void> {
  const adminSupabase = createAdminClient()

  // Reconcile the audit row to terminal success.
  const { error: piError } = await adminSupabase
    .from('payment_intents')
    .update({ status: 'succeeded', stripe_status: intent.status })
    .eq('stripe_payment_intent_id', intent.id)
  if (piError) {
    console.error(`[Stripe Webhook] payment_intents update failed for ${intent.id}:`, piError)
  }

  // Confirm only while still pending — idempotency guard against redelivery.
  const { data: confirmed, error: enrolError } = await adminSupabase
    .from('group_programme_enrolments')
    .update({ payment_status: 'succeeded', updated_at: new Date().toISOString() })
    .eq('id', enrolmentId)
    .eq('payment_status', 'pending')
    .select('id, programme_id, enrolment_reference, payment_model, sessions_paid_for')

  if (enrolError) {
    console.error(`[Stripe Webhook] enrolment confirm failed for ${enrolmentId}:`, enrolError)
    return
  }
  if (!confirmed || confirmed.length === 0) {
    console.info(`[Stripe Webhook] enrolment ${enrolmentId} not in pending; skipping (idempotent)`)
    return
  }
  const enrolment = confirmed[0]

  // Atomic, capacity-guarded spot claim. false = programme filled in the race
  // window → log for manual refund (S0 decision 3). The payment is already taken.
  const { data: claimed, error: spotError } = await adminSupabase.rpc('increment_programme_spots', {
    p_programme_id: enrolment.programme_id,
  })
  if (spotError) {
    console.error(`[Stripe Webhook] increment_programme_spots failed for ${enrolment.programme_id}:`, spotError)
  } else if (claimed === false) {
    console.error(
      `[Stripe Webhook] MANUAL REFUND NEEDED: enrolment ${enrolmentId} (${enrolment.enrolment_reference}) ` +
        `paid via ${intent.id} but programme ${enrolment.programme_id} is full`,
    )
  }

  console.info(`[Stripe Webhook] enrolment ${enrolmentId} confirmed via ${intent.id}`)

  // Confirmation email — recipient + name from the intent metadata (guest has no
  // stored email). Email failure never affects the 200.
  const guestEmail = intent.metadata?.guest_email
  const guestName = intent.metadata?.guest_name
  if (!guestEmail) return

  const { data: programme } = await adminSupabase
    .from('group_programmes')
    .select('title, day_of_week, days_of_week, start_time, duration_minutes, coach_profile_id')
    .eq('id', enrolment.programme_id)
    .maybeSingle()

  let coachName = 'your coach'
  if (programme?.coach_profile_id) {
    const { data: coach } = await adminSupabase
      .from('coach_profiles')
      .select('display_name, user_profile_id')
      .eq('id', programme.coach_profile_id)
      .maybeSingle()
    if (coach?.display_name) {
      coachName = coach.display_name
    } else if (coach?.user_profile_id) {
      const { data: coachUser } = await adminSupabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', coach.user_profile_id)
        .maybeSingle()
      if (coachUser?.full_name) coachName = coachUser.full_name
    }
  }

  const paid = enrolment.sessions_paid_for ?? 0
  const sessionsSummary =
    enrolment.payment_model === 'block'
      ? `Whole programme${paid > 0 ? ` · ${paid} sessions` : ''}`
      : `${paid} session${paid !== 1 ? 's' : ''}`

  const sent = await sendProgrammeConfirmation({
    guestName: guestName || 'there',
    guestEmail,
    coachName,
    enrolmentReference: enrolment.enrolment_reference ?? 'your enrolment',
    programmeTitle: programme?.title ?? 'your programme',
    scheduleSummary: programme
      ? formatProgrammeSchedule(
          programme.day_of_week,
          programme.days_of_week,
          programme.start_time,
          programme.duration_minutes,
        )
      : 'See your programme details',
    sessionsSummary,
    totalPence: intent.amount,
  })

  if (!sent) {
    console.error(`[Stripe Webhook] programme confirmation email failed for enrolment ${enrolmentId}`)
  }
}

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Builds "Every Saturday · 9:00am – 10:00am" from a programme's recurrence fields. */
function formatProgrammeSchedule(
  dayOfWeek: number | null,
  daysOfWeek: number[] | null,
  startTime: string | null,
  durationMinutes: number | null,
): string {
  const days =
    daysOfWeek && daysOfWeek.length > 0
      ? daysOfWeek
      : dayOfWeek !== null && dayOfWeek !== undefined
        ? [dayOfWeek]
        : []
  let dayPart = ''
  if (days.length === 1) dayPart = `Every ${DAY_LONG[days[0]] ?? ''}`.trim()
  else if (days.length > 1) dayPart = days.map((d) => DAY_SHORT[d] ?? '').filter(Boolean).join(', ')

  let timePart = ''
  if (startTime) {
    const start = to12Hour(startTime)
    const end = durationMinutes ? addMinutesToTime(startTime, durationMinutes) : null
    timePart = end ? `${start} – ${to12Hour(end)}` : start
  }
  return [dayPart, timePart].filter(Boolean).join(' · ') || 'Schedule TBC'
}

/** 'YYYY-MM-DD' → 'Tuesday, 1 July 2026'. Falls back to the raw value on parse failure. */
function formatSessionDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** 'HH:MM:SS' start/end → '2:00pm – 3:00pm'. Falls back to raw 'start – end' on parse failure. */
function formatSessionTime(start: string, end: string): string {
  return `${to12Hour(start)} – ${to12Hour(end)}`
}

function to12Hour(time: string): string {
  const [h, m] = time.split(':')
  const hour = Number(h)
  const minute = Number(m)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return time
  const period = hour < 12 ? 'am' : 'pm'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')}${period}`
}

/** Booking session_type ('individual' | 'group') → display label. */
function formatSessionType(type: string): string {
  if (type === 'individual') return 'Individual session'
  if (type === 'group') return 'Group session'
  return type
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

  // For a programme enrolment, also mark the enrolment failed (only while still
  // pending — never downgrade one a success event already confirmed).
  const enrolmentId = intent.metadata?.enrolment_id
  if (enrolmentId) {
    const { error: enrolError } = await adminSupabase
      .from('group_programme_enrolments')
      .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', enrolmentId)
      .eq('payment_status', 'pending')
    if (enrolError) {
      console.error(`[Stripe Webhook] enrolment failure update failed for ${enrolmentId}:`, enrolError)
    }
  }

  console.info(`[Stripe Webhook] payment_intent.payment_failed recorded for ${intent.id}`)
}
