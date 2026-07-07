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
//   - payment_intent.canceled         → release the held slot (BUG-13b)
//
// Event semantics for our card-only, auto-capture PaymentIntents (BUG-13b):
//   payment_failed is a PER-ATTEMPT signal — the intent drops back to
//   requires_payment_method and stays retryable, so it must NEVER release the
//   booking. canceled is DEFINITIVE — a cancelled intent can never be charged
//   — so it releases immediately. Time-based abandonment (no signal at all) is
//   handled by the reaper: GET /api/cron/release-expired-bookings.
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
import { RELEASE_REASON_PI_CANCELLED, isReleaseReason } from '@/lib/booking/release'
import { expandSessionBlocks, slotDisplayName } from '@/lib/availability/campSlots'

type SupabaseAdminClient = ReturnType<typeof createAdminClient>

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
        // 'pending'. The booking stays 'pending_payment' — a failed attempt is
        // retryable, never definitive (BUG-13b). Truly abandoned rows are
        // released by GET /api/cron/release-expired-bookings.
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent)
        break

      case 'payment_intent.canceled':
        // BUG-13b: a cancelled intent can never be charged — definitive.
        // Release the held slot immediately. Sources: the reaper, the guest
        // route's rollback path, or a manual cancel in the Stripe Dashboard.
        await handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent)
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
    // Usually: already confirmed by a prior delivery — idempotent no-op.
    // BUG-13b backstop: if the row was RELEASED (reaper / canceled path) and
    // the payment still somehow succeeded, restore it or scream for a refund
    // rather than silently keeping the money. Unreachable by design — the
    // reaper only releases AFTER Stripe confirms the cancel — so this is
    // defence-in-depth, not a working code path.
    await restoreReleasedBookingIfPaid(adminSupabase, intent, bookingId)
    return
  }

  console.info(`[Stripe Webhook] booking ${bookingId} confirmed via ${intent.id}`)

  await sendGuestBookingConfirmationEmail(adminSupabase, confirmed[0], intent)
}

/** Booking row shape needed to build the confirmation email. */
interface ConfirmedBookingRow {
  id: string
  booking_reference: string
  coach_profile_id: string
  session_date: string
  session_start_time: string
  session_end_time: string
  session_type: string
}

/**
 * Booking-confirmation email (P-00c-EMAIL). Fires exactly once — gated by the
 * pending_payment transition in the caller. The guest has no account and no
 * stored email, so the address + name come from the intent metadata stashed at
 * creation by /api/guest/bookings. Email failure NEVER affects the webhook
 * response: sendBookingConfirmation swallows and returns a boolean.
 *
 * Extracted verbatim from handlePaymentIntentSucceeded (BUG-13b) so the
 * succeeded-after-release restore path can send the same email. No logic change.
 */
async function sendGuestBookingConfirmationEmail(
  adminSupabase: SupabaseAdminClient,
  booking: ConfirmedBookingRow,
  intent: Stripe.PaymentIntent,
): Promise<void> {
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
    console.error(`[Stripe Webhook] confirmation email failed for booking ${booking.id}`)
  }
}

/**
 * BUG-13b defence-in-depth: payment_intent.succeeded arrived for a booking the
 * release path already freed (soft-deleted, status still 'pending_payment',
 * cancellation_reason holding a release marker). By design this cannot happen —
 * the reaper releases only AFTER Stripe confirms the intent is cancelled, and a
 * cancelled intent can never succeed — so this backstop exists for the
 * unknown-unknowns. Behaviour (approved in BUG-13b Step 0, 5 Jul 2026):
 *   - Slot still free → restore: undelete + confirm + messaging unlock, restore
 *     the provisional guest profile, send the confirmation email. Clearing
 *     deleted_at re-enters the migration-034 partial unique index, so Postgres
 *     itself arbitrates "still free" (23505 = it is not).
 *   - Slot re-booked → log MANUAL REFUND NEEDED loudly. No auto-refund in this
 *     task (Phase 2 hardening candidate, per Step 0 decision).
 * Never throws.
 */
async function restoreReleasedBookingIfPaid(
  adminSupabase: SupabaseAdminClient,
  intent: Stripe.PaymentIntent,
  bookingId: string,
): Promise<void> {
  const { data: row, error: rowError } = await adminSupabase
    .from('bookings')
    .select('id, status, deleted_at, cancellation_reason, booked_by_user_id, booking_reference')
    .eq('id', bookingId)
    .maybeSingle()

  if (rowError) {
    console.error(`[Stripe Webhook] released-booking lookup failed for ${bookingId}:`, rowError)
    return
  }

  if (!row || row.status !== 'pending_payment' || !row.deleted_at || !isReleaseReason(row.cancellation_reason)) {
    // The normal idempotent no-op: already confirmed by a prior delivery, or a
    // non-release soft delete (guest-route rollback). Nothing to restore.
    console.info(`[Stripe Webhook] booking ${bookingId} not in pending_payment; skipping (idempotent)`)
    return
  }

  const { data: restored, error: restoreError } = await adminSupabase
    .from('bookings')
    .update({
      deleted_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      status: 'confirmed',
      messaging_unlocked: true,
    })
    .eq('id', bookingId)
    .eq('status', 'pending_payment')
    .not('deleted_at', 'is', null)
    .select('id, booking_reference, coach_profile_id, session_date, session_start_time, session_end_time, session_type')

  if (restoreError) {
    // 23505 (unique_violation, migration-034 index) or 23P01
    // (exclusion_violation, coach_time_claims trigger — BUG-19 Phase 2) both
    // mean the slot's time was re-committed after release. Either way money
    // was taken for a booking we cannot restore — this MUST reach a human.
    console.error(
      `[Stripe Webhook] MANUAL REFUND NEEDED: booking ${bookingId} (${row.booking_reference}) ` +
        `paid via ${intent.id} AFTER release and restore failed ` +
        `(23505/23P01 = slot re-taken). Refund the payer and reconcile:`,
      restoreError,
    )
    return
  }

  if (!restored || restored.length === 0) {
    // A concurrent delivery restored it first — idempotent no-op.
    console.info(`[Stripe Webhook] booking ${bookingId} already restored; skipping (idempotent)`)
    return
  }

  // Restore the provisional guest profile the release path soft-deleted.
  const { error: profileError } = await adminSupabase
    .from('user_profiles')
    .update({ deleted_at: null })
    .eq('id', row.booked_by_user_id)
    .eq('is_provisional', true)
  if (profileError) {
    console.error(`[Stripe Webhook] provisional profile restore failed for ${row.booked_by_user_id}:`, profileError)
  }

  console.info(
    `[Stripe Webhook] booking ${bookingId} RESTORED after release via ${intent.id} (succeeded-after-release backstop)`,
  )

  await sendGuestBookingConfirmationEmail(adminSupabase, restored[0], intent)
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

  // Programme row fetched BEFORE the spot claim (BUG-23): camp_mode decides
  // which capacity mechanism confirms the spot; the same row feeds the email.
  const { data: programme } = await adminSupabase
    .from('group_programmes')
    .select('title, day_of_week, days_of_week, start_time, duration_minutes, coach_profile_id, camp_mode')
    .eq('id', enrolment.programme_id)
    .maybeSingle()

  // Atomic, capacity-guarded spot claim. false = filled in the race window →
  // log for manual refund (S0 decision 3). The payment is already taken.
  //
  // BUG-23 ruling 3: camp capacity is PER SLOT — confirm_camp_slot_spots()
  // re-counts succeeded others per (session, slot) under the migration-040
  // lock; camps never touch increment_programme_spots (current_spots stays 0).
  // Non-camp keeps the programme-level claim, byte-identical.
  if (programme?.camp_mode) {
    const { data: slotsOk, error: slotError } = await adminSupabase.rpc('confirm_camp_slot_spots', {
      p_enrolment_id: enrolment.id,
    })
    if (slotError) {
      console.error(`[Stripe Webhook] confirm_camp_slot_spots failed for ${enrolment.id}:`, slotError)
    } else if (slotsOk === false) {
      console.error(
        `[Stripe Webhook] MANUAL REFUND NEEDED: enrolment ${enrolmentId} (${enrolment.enrolment_reference}) ` +
          `paid via ${intent.id} but a selected camp slot is over capacity`,
      )
    }
  } else {
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
  }

  console.info(`[Stripe Webhook] enrolment ${enrolmentId} confirmed via ${intent.id}`)

  // Confirmation email — recipient + name from the intent metadata (guest has no
  // stored email). Email failure never affects the 200.
  const guestEmail = intent.metadata?.guest_email
  const guestName = intent.metadata?.guest_name
  if (!guestEmail) return

  // BUG-20: who the programme is for, stashed at intent creation. Absent on
  // intents created before BUG-20 — the email then omits its "Booking for"
  // row (same treatment as the 1-on-1 confirmation, UX-16).
  const enrolParticipantName = intent.metadata?.participant_name || undefined
  const enrolParticipantAgeRaw = Number.parseInt(intent.metadata?.participant_age ?? '', 10)
  const enrolParticipantAge = Number.isInteger(enrolParticipantAgeRaw) ? enrolParticipantAgeRaw : undefined

  // BUG-23: camp confirmations list exactly which slots were bought — e.g.
  // "Tue 4 Aug — Morning (9:00am – 12:00pm)" — from the junction rows (the
  // paid truth), never the client. Non-camp emails are unchanged.
  const sessionLines = programme?.camp_mode
    ? await buildCampSessionLines(adminSupabase, enrolment.id)
    : undefined

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
    participantName: enrolParticipantName,
    participantAge: enrolParticipantAge,
    sessionLines,
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
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-08-04' → 'Tue 4 Aug' (UTC-anchored — dates are wall-clock UK). */
function fmtShortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return `${DAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MON_SHORT[d.getUTCMonth()]}`
}

/**
 * BUG-23: the slot-level attendance lines for a camp confirmation email —
 * "Tue 4 Aug — Morning (9:00am – 12:00pm)" — built from the enrolment's
 * junction rows (the paid truth, written by reserve_camp_slot_sessions).
 * Returns undefined when nothing usable exists (email falls back to the
 * count-only summary). Never throws — the email must never break the 200.
 */
async function buildCampSessionLines(
  adminSupabase: SupabaseAdminClient,
  enrolmentId: string,
): Promise<string[] | undefined> {
  const { data: junctionRows, error: junctionError } = await adminSupabase
    .from('group_programme_enrolment_sessions')
    .select('group_programme_session_id, slot_index')
    .eq('enrolment_id', enrolmentId)

  if (junctionError || !junctionRows || junctionRows.length === 0) {
    if (junctionError) {
      console.error(`[Stripe Webhook] session-line lookup failed for ${enrolmentId}:`, junctionError)
    }
    return undefined
  }

  const sessionIds = [...new Set(junctionRows.map((r) => r.group_programme_session_id))]
  const { data: sessions, error: sessionsError } = await adminSupabase
    .from('group_programme_sessions')
    .select('id, session_date, start_time, end_time, slots')
    .in('id', sessionIds)

  if (sessionsError || !sessions) {
    if (sessionsError) {
      console.error(`[Stripe Webhook] session-line sessions lookup failed for ${enrolmentId}:`, sessionsError)
    }
    return undefined
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const lines: { date: string; slot: number; text: string }[] = []
  for (const row of junctionRows) {
    const session = sessionById.get(row.group_programme_session_id)
    if (!session) continue
    const blocks = expandSessionBlocks(session)
    const block = blocks[row.slot_index] ?? blocks[0]
    if (!block) continue
    lines.push({
      date: session.session_date,
      slot: row.slot_index,
      text: `${fmtShortDate(session.session_date)} — ${slotDisplayName(block.startTime)} (${to12Hour(block.startTime)} – ${to12Hour(block.endTime)})`,
    })
  }

  if (lines.length === 0) return undefined
  lines.sort((a, b) => (a.date === b.date ? a.slot - b.slot : a.date.localeCompare(b.date)))
  return lines.map((l) => l.text)
}

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
 * so the payer can retry against the same intent — for our card-only intents a
 * failed attempt is never definitive (BUG-13b). The update also bumps the audit
 * row's updated_at, which the reaper reads as "recent activity" so an actively
 * retrying payer never loses their slot. Truly abandoned rows are released by
 * GET /api/cron/release-expired-bookings. Never throws.
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

/**
 * payment_intent.canceled — the intent was cancelled via the Stripe API (BUG-13b).
 *
 * For our card-only, auto-capture intents this event has exactly three sources:
 * the reaper (GET /api/cron/release-expired-bookings), the guest route's
 * rollback path, and a manual cancel in the Stripe Dashboard. All are
 * DEFINITIVE — a cancelled intent can never be charged — so the booking's held
 * slot is released immediately rather than waiting out the TTL.
 *
 * Release semantics (approved BUG-13b Step 0): soft delete. Setting deleted_at
 * frees the slot atomically across the migration-034 partial unique index, the
 * public calendar read, and the write-side commitments guard; status stays
 * 'pending_payment' and cancellation_reason records why. The provisional guest
 * profile is soft-deleted alongside, mirroring the guest route's rollbacks.
 *
 * Idempotent: the release UPDATE is scoped to live pending_payment rows, so a
 * redelivery — or a cancel for a booking the guest route already rolled back,
 * or the reaper already released — is a no-op.
 *
 * Programme enrolments get the audit mark only (payment_status='failed' while
 * still pending, mirroring handlePaymentIntentFailed): a pending enrolment
 * holds no spot, so there is nothing to release (BUG-13b Step 0 scope call).
 *
 * Never throws — DB errors are logged and swallowed so the outer handler
 * returns 200.
 */
async function handlePaymentIntentCanceled(intent: Stripe.PaymentIntent): Promise<void> {
  const adminSupabase = createAdminClient()

  // Audit row → terminal. 'cancelled' is not in the migration-006 status CHECK;
  // status='failed' + stripe_status='canceled' records the precise truth
  // without a migration. Never downgrade a row a success event confirmed.
  const { error: piError } = await adminSupabase
    .from('payment_intents')
    .update({ status: 'failed', stripe_status: intent.status })
    .eq('stripe_payment_intent_id', intent.id)
    .neq('status', 'succeeded')

  if (piError) {
    console.error(`[Stripe Webhook] payment_intents cancel update failed for ${intent.id}:`, piError)
  }

  const enrolmentId = intent.metadata?.enrolment_id
  if (enrolmentId) {
    const { error: enrolError } = await adminSupabase
      .from('group_programme_enrolments')
      .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', enrolmentId)
      .eq('payment_status', 'pending')
    if (enrolError) {
      console.error(`[Stripe Webhook] enrolment cancel update failed for ${enrolmentId}:`, enrolError)
    }
    return
  }

  const bookingId = intent.metadata?.booking_id
  if (!bookingId) {
    console.info(`[Stripe Webhook] payment_intent.canceled ${intent.id} has no booking_id metadata`)
    return
  }

  // Release the slot — scoped so only a live, still-unpaid booking transitions.
  const now = new Date().toISOString()
  const { data: released, error: releaseError } = await adminSupabase
    .from('bookings')
    .update({
      deleted_at: now,
      cancelled_at: now,
      cancellation_reason: RELEASE_REASON_PI_CANCELLED,
    })
    .eq('id', bookingId)
    .eq('status', 'pending_payment')
    .is('deleted_at', null)
    .select('id, booked_by_user_id')

  if (releaseError) {
    console.error(`[Stripe Webhook] booking release failed for ${bookingId}:`, releaseError)
    return
  }

  if (!released || released.length === 0) {
    // Already released / rolled back / confirmed — idempotent no-op.
    console.info(`[Stripe Webhook] booking ${bookingId} not releasable; skipping (idempotent)`)
    return
  }

  // Soft-delete the provisional guest profile (strictly 1:1 with the booking).
  // The is_provisional guard means a real account is never touched.
  const bookerId = released[0].booked_by_user_id
  const { error: profileError } = await adminSupabase
    .from('user_profiles')
    .update({ deleted_at: now })
    .eq('id', bookerId)
    .eq('is_provisional', true)
    .is('deleted_at', null)
  if (profileError) {
    console.error(`[Stripe Webhook] provisional profile release failed for ${bookerId}:`, profileError)
  }

  console.info(`[Stripe Webhook] booking ${bookingId} released via payment_intent.canceled ${intent.id}`)
}
