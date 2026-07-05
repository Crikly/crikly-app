// BUG-13b — GET /api/cron/release-expired-bookings
//
// The pending_payment reaper. An abandoned guest checkout (browser closed, tab
// forgotten) leaves a booking in 'pending_payment' forever; since BUG-19
// Phase 1 that row holds its slot on the public calendar AND blocks the write
// side. Definitive Stripe signals release promptly via the webhook
// (payment_intent.canceled); this route bounds the no-signal case with a TTL.
//
// Invocation: Vercel cron (vercel.json, */10) sends GET with
// `Authorization: Bearer ${CRON_SECRET}` automatically when the CRON_SECRET
// env var is set. Locally: curl with the same header. The route is inert
// until Lasith sets CRON_SECRET and deploys — nothing hosted happens from
// this repo change alone.
//
// ── Race safety — cancel-first arbitration (approved BUG-13b Step 0) ────────
// Money is only ever taken by a succeeded PaymentIntent, and this route NEVER
// releases a row until Stripe has confirmed the intent is cancelled (a
// cancelled intent can never be charged). Per candidate:
//   PI succeeded                       → skip + loud log (webhook reconciles;
//                                        NEVER release a paid booking)
//   PI processing / requires_action    → skip until the hard cap (a slow 3DS
//                                        flow must not be killed mid-flight)
//   otherwise                          → stripe.paymentIntents.cancel(); only
//                                        a SUCCESSFUL cancel permits release.
//                                        A cancel that raced to success throws
//                                        → skip, next run reconciles.
// If the cancel lands but the DB release below fails, the
// payment_intent.canceled webhook heals it — the two paths converge.
//
// ── TTL (approved BUG-13b Step 0) ────────────────────────────────────────────
//   SOFT_TTL   15 min — real card checkout incl. 3DS completes well inside
//              this (typically under 10 min), and the activity grace below
//              extends the hold for anyone still actively paying.
//   GRACE      15 min of payment-intent inactivity — every failed attempt
//              bumps payment_intents.updated_at via the payment_failed
//              webhook, so an actively retrying payer keeps their slot.
//   HARD_CAP   2 h — after this even processing/requires_action intents get a
//              cancel attempt (abandoned mid-3DS); if Stripe refuses, we skip
//              and retry next run.
//
// Release semantics: soft delete + release reason (see lib/booking/release.ts)
// — frees the slot atomically across the 034 index, the public calendar read,
// and the write-side guard, and the provisional guest profile is soft-deleted
// alongside, mirroring the guest route's rollback paths.
//
// Phase 2 (BUG-19): the coach_time_claims drift reconciler runs at the end of
// THIS route (same cadence, same secret — no second cron). Claims are
// trigger-maintained (migration 038), so releasing a booking above releases
// its claim in the same transaction; the reconciler only catches drift (e.g. a
// manual Studio edit that dodged a trigger) and a non-zero count is logged
// loudly as an anomaly, never a working path.

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import { RELEASE_REASON_EXPIRED } from '@/lib/booking/release'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SOFT_TTL_MINUTES = 15
const ACTIVITY_GRACE_MINUTES = 15
const HARD_CAP_MINUTES = 120
// Bounds a single run (Stripe round-trips dominate). A backlog beyond this
// drains across subsequent runs — never silently dropped, just deferred.
const BATCH_LIMIT = 50

interface CandidateRow {
  id: string
  created_at: string
  booked_by_user_id: string
}

interface PaymentIntentRow {
  booking_id: string | null
  stripe_payment_intent_id: string
  status: string
  updated_at: string
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Reaper] CRON_SECRET is not set')
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let stripe: Stripe
  try {
    stripe = getStripe()
  } catch (err) {
    console.error('[Reaper]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const supabase = createAdminClient()
  const nowMs = Date.now()
  const softCutoff = new Date(nowMs - SOFT_TTL_MINUTES * 60_000).toISOString()
  const graceCutoff = new Date(nowMs - ACTIVITY_GRACE_MINUTES * 60_000).toISOString()
  const hardCutoff = new Date(nowMs - HARD_CAP_MINUTES * 60_000).toISOString()

  // Candidates: live pending_payment rows older than the soft TTL. Oldest
  // first so a backlog drains in creation order under the batch cap.
  const { data: candidates, error: candidatesError } = await supabase
    .from('bookings')
    .select('id, created_at, booked_by_user_id')
    .eq('status', 'pending_payment')
    .is('deleted_at', null)
    .lt('created_at', softCutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (candidatesError) {
    console.error('[Reaper] candidate query failed:', candidatesError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const rows = (candidates ?? []) as CandidateRow[]
  const counts = {
    checked: rows.length,
    released: 0,
    skipped_active: 0,
    skipped_stripe: 0,
    errors: 0,
    claims_reconciled: 0,
  }

  if (rows.length === 0) {
    counts.claims_reconciled = await reconcileClaims(supabase)
    return NextResponse.json(counts)
  }

  // One batched lookup for the candidates' payment-intent audit rows. Latest
  // row wins per booking (the guest flow only ever writes one, but be safe).
  const { data: piData, error: piLookupError } = await supabase
    .from('payment_intents')
    .select('booking_id, stripe_payment_intent_id, status, updated_at')
    .in('booking_id', rows.map((r) => r.id))
    .order('created_at', { ascending: true })

  if (piLookupError) {
    console.error('[Reaper] payment_intents lookup failed:', piLookupError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const piByBooking = new Map<string, PaymentIntentRow>()
  for (const pi of (piData ?? []) as PaymentIntentRow[]) {
    if (pi.booking_id) piByBooking.set(pi.booking_id, pi) // ascending order → last write wins
  }

  for (const booking of rows) {
    const pi = piByBooking.get(booking.id)

    // Activity grace: a recent update (failed attempt, requires_action, any
    // webhook touch) means the payer is live — never reap under their feet.
    if (pi && pi.updated_at > graceCutoff) {
      counts.skipped_active++
      continue
    }

    // Paid but never confirmed → a webhook delivery problem, NOT reaper
    // business. Never release; scream for reconciliation.
    if (pi?.status === 'succeeded') {
      console.error(
        `[Reaper] booking ${booking.id} has a succeeded payment_intents row but is still ` +
          `pending_payment — skipping release; investigate webhook delivery for ${pi.stripe_payment_intent_id}`,
      )
      counts.errors++
      continue
    }

    if (pi) {
      // Stripe is the arbiter: retrieve, then cancel-first.
      let intent: Stripe.PaymentIntent
      try {
        intent = await stripe.paymentIntents.retrieve(pi.stripe_payment_intent_id)
      } catch (err) {
        console.error(`[Reaper] PI retrieve failed for ${pi.stripe_payment_intent_id}:`, err)
        counts.errors++
        continue
      }

      if (intent.status === 'succeeded') {
        console.error(
          `[Reaper] booking ${booking.id} paid via ${intent.id} but audit row/booking lag — ` +
            `skipping release; the succeeded webhook must confirm it`,
        )
        counts.errors++
        continue
      }

      const inFlight = intent.status === 'processing' || intent.status === 'requires_action'
      if (inFlight && booking.created_at > hardCutoff) {
        // A slow 3DS/processing flow inside the hard cap — leave it alone.
        counts.skipped_stripe++
        continue
      }

      if (intent.status !== 'canceled') {
        try {
          await stripe.paymentIntents.cancel(intent.id, { cancellation_reason: 'abandoned' })
        } catch (err) {
          // Raced to success (or uncancellable processing) — do NOT release.
          // The next run, or the succeeded webhook, reconciles.
          console.error(`[Reaper] PI cancel refused for ${intent.id} — not releasing booking ${booking.id}:`, err)
          counts.skipped_stripe++
          continue
        }
      }

      // Converge the audit row now; the payment_intent.canceled webhook does
      // the same idempotently when it lands.
      const { error: piUpdateError } = await supabase
        .from('payment_intents')
        .update({ status: 'failed', stripe_status: 'canceled' })
        .eq('stripe_payment_intent_id', pi.stripe_payment_intent_id)
        .neq('status', 'succeeded')
      if (piUpdateError) {
        console.error(`[Reaper] payment_intents update failed for ${pi.stripe_payment_intent_id}:`, piUpdateError)
      }
    } else {
      // No audit row: the guest route crashed between booking insert and PI
      // persist. Any intent Stripe may hold is unreachable (its client_secret
      // never left the server, and a client replay would have re-persisted
      // it), so releasing without a cancel is safe here — and this is the one
      // shape with no PI to cancel.
      console.info(`[Reaper] booking ${booking.id} has no payment_intents row — releasing directly`)
    }

    // Cancel confirmed (or no PI ever existed) → release. Scoped guard makes
    // a concurrent webhook release a harmless no-op.
    const nowIso = new Date().toISOString()
    const { data: released, error: releaseError } = await supabase
      .from('bookings')
      .update({
        deleted_at: nowIso,
        cancelled_at: nowIso,
        cancellation_reason: RELEASE_REASON_EXPIRED,
      })
      .eq('id', booking.id)
      .eq('status', 'pending_payment')
      .is('deleted_at', null)
      .select('id')

    if (releaseError) {
      console.error(`[Reaper] booking release failed for ${booking.id}:`, releaseError)
      counts.errors++
      continue
    }
    if (!released || released.length === 0) {
      continue // webhook got there first — already released
    }

    // Soft-delete the provisional guest profile (1:1 with the booking; the
    // is_provisional guard protects real accounts).
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({ deleted_at: nowIso })
      .eq('id', booking.booked_by_user_id)
      .eq('is_provisional', true)
      .is('deleted_at', null)
    if (profileError) {
      console.error(`[Reaper] provisional profile release failed for ${booking.booked_by_user_id}:`, profileError)
    }

    counts.released++
    console.info(`[Reaper] released expired pending_payment booking ${booking.id}`)
  }

  counts.claims_reconciled = await reconcileClaims(supabase)

  console.info(
    `[Reaper] run complete: checked=${counts.checked} released=${counts.released} ` +
      `active=${counts.skipped_active} stripe_skip=${counts.skipped_stripe} errors=${counts.errors} ` +
      `claims_reconciled=${counts.claims_reconciled}`,
  )
  return NextResponse.json(counts)
}

/**
 * BUG-19 Phase 2: release any active coach_time_claims row whose source no
 * longer holds its slot (reconcile_coach_time_claims(), migration 038).
 * Triggers are the only claim writer, so the expected result is 0 — anything
 * else is drift and is logged loudly for investigation. Never throws; a
 * failed sweep must not break the reaper (they are independent safety nets).
 */
async function reconcileClaims(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data, error } = await supabase.rpc('reconcile_coach_time_claims')
  if (error) {
    console.error('[Reaper] coach_time_claims reconcile failed:', error)
    return 0
  }
  const released = typeof data === 'number' ? data : 0
  if (released > 0) {
    console.error(
      `[Reaper] coach_time_claims DRIFT: reconciler released ${released} claim(s) whose source no ` +
        `longer holds — triggers should make this impossible; investigate recent manual edits`,
    )
  }
  return released
}
