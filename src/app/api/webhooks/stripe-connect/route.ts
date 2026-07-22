// Stripe CONNECT webhook receiver — events from coach connected accounts.
//
// This endpoint is separate from /api/webhooks/stripe (platform events).
// Connected-account events are delivered to a Connect-configured endpoint in
// the Stripe Dashboard and signed with that endpoint's own secret:
// STRIPE_CONNECT_WEBHOOK_SECRET — never STRIPE_WEBHOOK_SECRET (BUG-44).
//
// Security non-negotiables (docs/06_SECURITY_COMPLIANCE.md §Payment Security):
//   - Verify the signature BEFORE touching the payload.
//   - Verify against the raw request body — request.text() not request.json().
//   - Reject with 400 on signature failure (Stripe Dashboard surfaces it).
//
// Runtime: Node.js (Stripe SDK isn't edge-safe). `force-dynamic` so Next.js
// doesn't try to cache or pre-render this route.
//
// Handled events:
//   - account.updated → coach_profiles.stripe_onboarding_complete =
//     (charges_enabled && payouts_enabled), BIDIRECTIONAL — a revoked
//     capability flips the flag back to false (BUG-44 ruling A, matching the
//     platform route's semantics). details_submitted alone is NOT enough:
//     Stripe can still have charges/payouts disabled pending verification.
//   - transfer.created / transfer.failed / payout.created / payout.paid /
//     payout.failed → log-only for Block 0; full payout logic is post-Block-0.
//
// Idempotency (BUG-44 ruling B): no stripe_webhook_events ledger here — the
// only DB write is an idempotent boolean update, so a Stripe redelivery is
// harmless by construction. A transient DB failure returns 500 so Stripe
// redelivers; everything else acknowledges with 200 (non-2xx responses make
// Stripe retry, and unhandled types must never self-DoS).
//
// Follow-ups (logged in BUG-44 Step 0, not this task):
//   - Remove the duplicate account.updated handler from the platform route
//     once this endpoint is live in the Stripe Dashboard.
//   - Extract the BUG-15 event ledger into a shared lib and adopt it here.
//   - Handle account.application.deauthorized.

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Connected-account money events we acknowledge and log for Block 0. */
const LOG_ONLY_EVENTS = new Set<string>([
  'transfer.created',
  'transfer.failed',
  'payout.created',
  'payout.paid',
  'payout.failed',
])

/**
 * POST /api/webhooks/stripe-connect
 *
 * Verifies the Connect signature, dispatches, and returns:
 *   400 — signature failure / missing signature (Stripe surfaces it)
 *   200 — processed, log-only event, or unhandled type
 *   500 — misconfiguration or transient DB failure (Stripe redelivers; the
 *         account.updated write is idempotent so a retry is always safe)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Pull the CONNECT signing secret. Crash early at request time if missing
  //    rather than at module load — a misconfigured env should surface as a
  //    clear 500 on the first webhook, not a build error.
  const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!connectWebhookSecret) {
    console.error('[Stripe Connect Webhook] STRIPE_CONNECT_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // Stripe client is lazy-initialised (see lib/stripe/client.ts) so the module
  // import never crashes the build. Surface a missing API key as a clear 500
  // here at request time rather than an unhandled throw.
  let stripe: Stripe
  try {
    stripe = getStripe()
  } catch (err) {
    console.error('[Stripe Connect Webhook]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // 2. Read the raw body. Signature verification MUST run against the bytes
  //    Stripe sent, not a re-serialised JSON object — request.text() preserves
  //    them exactly. NEVER replace this with request.json().
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch (err) {
    console.error('[Stripe Connect Webhook] Failed to read raw body:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // 3. Pull the signature from the canonical Stripe header.
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    console.error('[Stripe Connect Webhook] Missing stripe-signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // 4. Verify against the CONNECT endpoint's secret. Any failure means we did
  //    NOT get a real Stripe event (replay, forgery, secret rotation in
  //    flight, or a platform event hitting the wrong endpoint) — reject.
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, connectWebhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('[Stripe Connect Webhook] Signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // 5. Dispatch. Connected-account events carry the acct_... id in
  //    event.account; for account.updated the data object IS the account.
  try {
    if (event.type === 'account.updated') {
      // account.updated always carries a Stripe.Account object per Stripe's
      // API contract. The cast is safe; future event types must verify their own.
      await handleAccountUpdated(event.data.object as Stripe.Account)
    } else if (LOG_ONLY_EVENTS.has(event.type)) {
      // Block 0: acknowledge and record. Full transfer/payout reconciliation
      // is a post-Block-0 task — these logs give ops visibility until then.
      const objectId = (event.data.object as { id?: string }).id ?? 'unknown'
      console.info(
        `[Stripe Connect Webhook] ${event.type} for account=${event.account ?? 'unknown'} object=${objectId} — logged (Block 0)`,
      )
    } else {
      // Stripe sends many event types we don't subscribe to here. Acknowledge
      // and move on — console.info gives ops visibility into what's arriving.
      console.info(`[Stripe Connect Webhook] Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error(
      `[Stripe Connect Webhook] failure for ${event.id} (${event.type}) — 500 for redelivery:`,
      message,
    )
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}

/**
 * account.updated — a coach's Stripe Connect account state changed.
 *
 * Writes `coach_profiles.stripe_onboarding_complete = (charges_enabled && payouts_enabled)`.
 * Handles both directions: true when both flags are true, false when either is
 * false (Stripe revoking a capability flips the flag back as a safety net).
 * Identical semantics to the platform route's handler (BUG-44 ruling A).
 *
 * Throws on DB failure — the POST handler maps it to a 500 so Stripe
 * redelivers; the boolean write is idempotent, so a retry is always safe.
 */
async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  const isComplete = account.charges_enabled === true && account.payouts_enabled === true

  // Admin client: webhook has no user session, so RLS cannot apply —
  // ownership is implicit in the stripe_account_id match.
  const adminSupabase = createAdminClient()
  const { data: rows, error: updateError } = await adminSupabase
    .from('coach_profiles')
    .update({ stripe_onboarding_complete: isComplete })
    .eq('stripe_account_id', account.id)
    .select('id')

  if (updateError) {
    throw new Error(`account.updated DB update failed for ${account.id}: ${updateError.message}`)
  }

  if (!rows || rows.length === 0) {
    // No coach in this DB has that Stripe account. Plausible: different
    // environment (test event hitting live, vice versa), coach soft-deleted
    // after onboarding, or a fresh local DB. NOT an error — log info and move on.
    console.info(
      `[Stripe Connect Webhook] account.updated: no coach found with stripe_account_id=${account.id}`,
    )
    return
  }

  console.info(
    `[Stripe Connect Webhook] account.updated: ${rows.length} coach row(s) set stripe_onboarding_complete=${isComplete} for ${account.id}`,
  )
}
