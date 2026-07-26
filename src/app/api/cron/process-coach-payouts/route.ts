// C-PAY-02 — GET /api/cron/process-coach-payouts
//
// The coach payout transfer job. Moves money owed to coaches from the Crikly
// Stripe account to their Connect account once the booking has completed and
// the BR-03 hold has passed (payout_eligible_at, stamped by C-PAY-01).
//
// BR-02: coach payout = booking.coach_price_pence − the ACTUAL Stripe fee,
// read from balance_transaction.fee on the real charge (expanded off the
// PaymentIntent) — never estimated, never a fixed rate.
//
// Selection is starvation-proof by construction — settled work can never jam
// the batch, because neither query can return it:
//   A. Discovery — completed, eligible bookings with NO payout row yet
//      (PostgREST anti-join: left-embed payouts + is-null filter). A booking
//      leaves this set the moment its payout row is written.
//   B. Work queue — payout rows still owed action, per the migration-043
//      contract: status IN ('pending','held') plus 'failed' under the retry
//      cap, due by scheduled_at, booking embedded. 'processing'/'paid' rows
//      are excluded by the WHERE itself.
// Retry-exhausted rows are excluded from B so they cannot crowd it either;
// their count is surfaced loudly every run (counts.parked) instead.
//
// Idempotency — one booking must never receive two transfers (three layers):
//   1. DB     — payouts.booking_id is UNIQUE (migration 045), so the payout
//               row UUID is stable per booking forever.
//   2. Stripe — transfers.create() is keyed on that row UUID; a re-fire
//               returns the original transfer instead of creating another.
//   3. App    — rows already 'processing'/'paid' are skipped outright.
//
// Held-payout contract (C-PAY-03, migration 043, src/types/domain.ts): a
// coach without a usable Stripe account holds the row (status='held' +
// held_reason). A hold is NOT a failure — no retry_count increment, no
// failure_reason. Held rows are re-evaluated on every run; release is
// automatic once Stripe is ready: held → 'pending' clearing held_reason in
// the SAME update (the held_reason_iff_held biconditional demands it), then
// the transfer proceeds in the same run.
//
// Write-intent-first: the payout row is written BEFORE the transfer fires, so
// a crash between the two leaves an auditable 'pending' row, never a ghost
// transfer with no trail. The reverse crash (transfer fired, success update
// lost) is healed by the ghost-transfer reconcile guard: any pre-existing row
// with no stripe_transfer_id is checked against
// transfers.list({ transfer_group }) before a create — an existing transfer
// is adopted, never re-fired. This also covers Stripe's ~24h idempotency-key
// expiry, after which a blind re-fire would double-pay.
//
// Failures are per-row: a Stripe error marks that row 'failed'
// (failure_reason + retry_count) and the loop continues with the rest.
// Failed rows retry on later runs until MAX_RETRY, then park with a loud log
// for manual investigation.
//
// Invocation: Vercel cron (vercel.json, hourly at :05 — five minutes after
// C-PAY-01's :00 completion pass) sends GET with
// `Authorization: Bearer ${CRON_SECRET}` — same pattern as the other cron
// routes. Inert until CRON_SECRET is set and deployed.
//
// Admin client: cron has no user session, and payouts INSERT/UPDATE is
// service-role-only by design (migration 006).

import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import type { PayoutHeldReason, PayoutStatus } from '@/types/domain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Bounds each selection query, so a run touches at most 2×BATCH_LIMIT rows
// (Stripe round-trips dominate). A backlog drains across subsequent runs,
// oldest money owed first — deferred, never dropped.
const BATCH_LIMIT = 50
// After this many failed transfer attempts a row parks (excluded from the
// work queue + loud parked count every run) until manually investigated.
// Retries happen hourly, so all five attempts land well inside Stripe's ~24h
// idempotency-key window.
const MAX_RETRY = 5
const FAILURE_REASON_MAX = 500

interface BookingRow {
  id: string
  booking_reference: string
  coach_profile_id: string
  coach_price_pence: number
  currency: string
  // Nullable in the DB, but never null here: query A's .lte() excludes NULLs
  // and query B rows only exist because eligibility was already stamped.
  payout_eligible_at: string
}

interface PayoutRow {
  id: string
  booking_id: string
  status: PayoutStatus
  retry_count: number
  stripe_transfer_id: string | null
  held_reason: PayoutHeldReason | null
}

interface QueueRow extends PayoutRow {
  bookings: BookingRow
}

interface CoachRow {
  id: string
  stripe_account_id: string | null
  stripe_onboarding_complete: boolean
}

interface PaymentIntentRow {
  booking_id: string | null
  stripe_payment_intent_id: string
}

interface WorkItem {
  booking: BookingRow
  payout: PayoutRow | null
}

interface ChargeFee {
  chargeId: string
  feePence: number
}

/**
 * Resolves the actual Stripe fee (in pence) and the charge id for a
 * succeeded PaymentIntent by expanding latest_charge.balance_transaction.
 * Returns null when the expansion cannot be resolved to objects — which
 * should be impossible for a settled card charge and is treated as a loud
 * per-row error by the caller. BR-02: this fee is the only permitted source;
 * estimating is banned.
 */
async function resolveChargeFee(stripe: Stripe, paymentIntentId: string): Promise<ChargeFee | null> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge.balance_transaction'],
  })
  const charge = intent.latest_charge
  if (!charge || typeof charge === 'string') return null
  const balanceTransaction = charge.balance_transaction
  if (!balanceTransaction || typeof balanceTransaction === 'string') return null
  return { chargeId: charge.id, feePence: balanceTransaction.fee }
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, FAILURE_REASON_MAX)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Payouts] CRON_SECRET is not set')
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let stripe: Stripe
  try {
    stripe = getStripe()
  } catch (err) {
    console.error('[Payouts]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  const [newRes, queueRes, parkedRes] = await Promise.all([
    // Query A — discovery: eligible bookings the job has never touched (no
    // payout row → the left-embed is null). Cannot return settled work.
    supabase
      .from('bookings')
      .select(
        'id, booking_reference, coach_profile_id, coach_price_pence, currency, payout_eligible_at, payouts!left(id)',
      )
      .eq('status', 'completed')
      .is('deleted_at', null)
      .lte('payout_eligible_at', nowIso)
      .is('payouts', null)
      .order('payout_eligible_at', { ascending: true })
      .limit(BATCH_LIMIT),
    // Query B — work queue: rows still owed action (043 contract selection +
    // failed retries under the cap). The embedded !inner booking must still
    // be a live completed booking.
    supabase
      .from('payouts')
      .select(
        'id, booking_id, status, retry_count, stripe_transfer_id, held_reason, ' +
          'bookings!inner(id, booking_reference, coach_profile_id, coach_price_pence, currency, payout_eligible_at)',
      )
      .or(`status.in.(pending,held),and(status.eq.failed,retry_count.lt.${MAX_RETRY})`)
      .lte('scheduled_at', nowIso)
      .eq('bookings.status', 'completed')
      .is('bookings.deleted_at', null)
      .order('scheduled_at', { ascending: true })
      .limit(BATCH_LIMIT),
    // Parked rows are excluded from the queue so they can never starve it —
    // surface their count loudly instead so they are impossible to forget.
    supabase
      .from('payouts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('retry_count', MAX_RETRY),
  ])

  if (newRes.error || queueRes.error) {
    console.error('[Payouts] candidate query failed:', newRes.error ?? queueRes.error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const parked = parkedRes.count ?? 0
  if (parkedRes.error) {
    console.error('[Payouts] parked count query failed:', parkedRes.error)
  } else if (parked > 0) {
    console.error(
      `[Payouts] ${parked} payout(s) parked at ${MAX_RETRY} failed transfer attempts — money is owed; needs manual investigation`,
    )
  }

  // Merge into one work list, queue rows first on conflict (a race between a
  // row insert and query A can momentarily show a booking in both shapes).
  const queueRows = (queueRes.data ?? []) as unknown as QueueRow[]
  const newRows = (newRes.data ?? []) as unknown as Array<BookingRow & { payouts: unknown }>
  const work = new Map<string, WorkItem>()
  for (const row of queueRows) {
    const { bookings: booking, ...payout } = row
    work.set(payout.booking_id, { booking, payout })
  }
  for (const row of newRows) {
    if (!work.has(row.id)) {
      const { payouts: _embed, ...booking } = row
      void _embed
      work.set(booking.id, { booking, payout: null })
    }
  }
  // Oldest money owed first across both sources.
  const items = [...work.values()].sort((a, b) =>
    a.booking.payout_eligible_at.localeCompare(b.booking.payout_eligible_at),
  )

  const counts = {
    checked: items.length,
    transferred: 0,
    adopted: 0,
    released: 0,
    held: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
    parked,
  }

  if (items.length === 0) {
    return NextResponse.json(counts)
  }

  const bookingIds = items.map((i) => i.booking.id)
  const coachIds = [...new Set(items.map((i) => i.booking.coach_profile_id))]

  const [coachRes, piRes] = await Promise.all([
    // A soft-deleted coach will simply not be found below → loud per-row
    // error. That is deliberate: C-PAY-03 blocks account deletion while any
    // payout is owed, so a deleted coach with eligible money is an anomaly
    // to investigate, never something to pay or hold silently.
    supabase
      .from('coach_profiles')
      .select('id, stripe_account_id, stripe_onboarding_complete')
      .in('id', coachIds)
      .is('deleted_at', null),
    supabase
      .from('payment_intents')
      .select('booking_id, stripe_payment_intent_id')
      .in('booking_id', bookingIds)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: true }),
  ])

  if (coachRes.error || piRes.error) {
    console.error('[Payouts] batch lookup failed:', coachRes.error ?? piRes.error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const coachById = new Map<string, CoachRow>()
  for (const c of (coachRes.data ?? []) as CoachRow[]) coachById.set(c.id, c)

  // Ascending created_at → last write wins (only one succeeded PI should
  // ever exist per booking, but be safe).
  const piByBooking = new Map<string, PaymentIntentRow>()
  for (const pi of (piRes.data ?? []) as PaymentIntentRow[]) {
    if (pi.booking_id) piByBooking.set(pi.booking_id, pi)
  }

  for (const { booking, payout } of items) {
    // Per-row isolation: nothing thrown for one booking may stop the rest.
    try {
      // Belt-and-braces guards — the selection queries already exclude these
      // shapes; if one slips through (query drift, race), never fire again.
      if (payout && (payout.status === 'processing' || payout.status === 'paid')) {
        counts.skipped++
        continue
      }
      if (payout && payout.status === 'failed' && payout.retry_count >= MAX_RETRY) {
        console.error(
          `[Payouts] payout ${payout.id} (booking ${booking.id}) has exhausted ` +
            `${MAX_RETRY} transfer attempts — parked; needs manual investigation`,
        )
        counts.skipped++
        continue
      }

      const coach = coachById.get(booking.coach_profile_id)
      if (!coach) {
        console.error(
          `[Payouts] coach_profiles ${booking.coach_profile_id} missing or deleted for booking ${booking.id} — ` +
            `money is owed but the coach row is unusable; investigate`,
        )
        counts.errors++
        continue
      }

      const accountId = coach.stripe_account_id
      const heldReason: PayoutHeldReason | null = !accountId
        ? 'no_stripe_account'
        : !coach.stripe_onboarding_complete
          ? 'stripe_onboarding_incomplete'
          : null

      // Cheap hold paths first — an existing row already carries its amount,
      // so re-evaluating an ongoing hold costs zero Stripe calls.
      if (heldReason && payout) {
        if (payout.status === 'held') {
          if (payout.held_reason !== heldReason) {
            const { error } = await supabase
              .from('payouts')
              .update({ held_reason: heldReason })
              .eq('id', payout.id)
              .eq('status', 'held')
            if (error) {
              console.error(`[Payouts] held_reason update failed for payout ${payout.id}:`, error)
              counts.errors++
              continue
            }
          }
        } else {
          // pending/failed row whose coach is no longer Stripe-ready → hold
          // it. failure_reason is cleared because the row's current state is
          // a hold, not a failure (history stays in retry_count and logs);
          // held_reason_iff_held requires the reason in the same update. The
          // status guard makes a concurrent run's write win harmlessly.
          const { error } = await supabase
            .from('payouts')
            .update({ status: 'held', held_reason: heldReason, failure_reason: null })
            .eq('id', payout.id)
            .eq('status', payout.status)
          if (error) {
            console.error(`[Payouts] hold update failed for payout ${payout.id}:`, error)
            counts.errors++
            continue
          }
        }
        counts.held++
        continue
      }

      // Every remaining path (new hold row, new pending row, transfer) needs
      // the real BR-02 amount → resolve the actual fee from the charge.
      const pi = piByBooking.get(booking.id)
      if (!pi) {
        console.error(
          `[Payouts] booking ${booking.id} is completed but has no succeeded ` +
            `payment_intents row — cannot pay out; investigate payment records`,
        )
        counts.errors++
        continue
      }

      let chargeFee: ChargeFee | null
      try {
        chargeFee = await resolveChargeFee(stripe, pi.stripe_payment_intent_id)
      } catch (err) {
        console.error(`[Payouts] PaymentIntent retrieve failed for ${pi.stripe_payment_intent_id} (booking ${booking.id}):`, err)
        counts.errors++
        continue
      }
      if (!chargeFee) {
        console.error(
          `[Payouts] could not resolve latest_charge.balance_transaction for ` +
            `${pi.stripe_payment_intent_id} (booking ${booking.id}) — no payout without the actual fee (BR-02)`,
        )
        counts.errors++
        continue
      }

      const amountPence = booking.coach_price_pence - chargeFee.feePence
      if (amountPence <= 0) {
        // Approved edge ruling: fee ≥ coach price → no row written (the
        // amount_pence > 0 CHECK would reject it anyway). Loud — an admin
        // must resolve this booking manually.
        console.error(
          `[Payouts] Stripe fee ${chargeFee.feePence}p >= coach price ${booking.coach_price_pence}p ` +
            `for booking ${booking.id} — skipping, no payout row written; needs admin`,
        )
        counts.skipped++
        continue
      }

      if (heldReason) {
        // First sighting of an unpayable coach → write the held intent row.
        // It carries the real amount so what the coach is owed stays accurate
        // while held.
        const { error } = await supabase.from('payouts').insert({
          id: randomUUID(),
          booking_id: booking.id,
          coach_profile_id: booking.coach_profile_id,
          amount_pence: amountPence,
          currency: booking.currency,
          status: 'held',
          held_reason: heldReason,
          scheduled_at: booking.payout_eligible_at,
        })
        if (error) {
          if (error.code === '23505') {
            counts.skipped++ // concurrent run already wrote the row — its problem now
          } else {
            console.error(`[Payouts] held insert failed for booking ${booking.id}:`, error)
            counts.errors++
          }
          continue
        }
        console.info(`[Payouts] held payout for booking ${booking.id}: ${heldReason}`)
        counts.held++
        continue
      }

      if (!accountId) {
        // Unreachable — heldReason above covers it; guard keeps the TS
        // narrowing honest without a non-null assertion.
        counts.errors++
        continue
      }

      // ── Coach ready → transfer path ─────────────────────────────────────
      let payoutId: string
      let priorTransferId: string | null = null
      let retryBase = 0
      let preExisting = false

      if (payout) {
        payoutId = payout.id
        priorTransferId = payout.stripe_transfer_id
        retryBase = payout.retry_count
        preExisting = true
        if (payout.status === 'held') {
          // Release: leave 'held' and clear held_reason in ONE update
          // (held_reason_iff_held). The transfer proceeds below in this run.
          const { error } = await supabase
            .from('payouts')
            .update({ status: 'pending', held_reason: null })
            .eq('id', payout.id)
            .eq('status', 'held')
          if (error) {
            console.error(`[Payouts] hold release failed for payout ${payout.id}:`, error)
            counts.errors++
            continue
          }
          counts.released++
          console.info(`[Payouts] released held payout ${payout.id} (booking ${booking.id}) — Stripe now ready`)
        }
      } else {
        // Write intent FIRST: if the transfer fires and this insert had
        // failed, we'd have a ghost transfer with no audit trail. The UUID is
        // generated client-side so the Stripe idempotency key exists before
        // any money moves.
        payoutId = randomUUID()
        const { error } = await supabase.from('payouts').insert({
          id: payoutId,
          booking_id: booking.id,
          coach_profile_id: booking.coach_profile_id,
          amount_pence: amountPence,
          currency: booking.currency,
          status: 'pending',
          scheduled_at: booking.payout_eligible_at,
        })
        if (error) {
          if (error.code === '23505') {
            counts.skipped++ // concurrent run inserted first and owns this booking
          } else {
            console.error(`[Payouts] pending insert failed for booking ${booking.id} — transfer NOT fired:`, error)
            counts.errors++
          }
          continue
        }
      }

      // Ghost-transfer reconcile guard (approved Step 0 §3): a pre-existing
      // row with no stripe_transfer_id may belong to a run that crashed
      // after transfers.create() — and past Stripe's ~24h idempotency-key
      // expiry a blind re-fire would double-pay. Ask Stripe before creating.
      if (preExisting && !priorTransferId) {
        let existing: Stripe.Transfer | undefined
        try {
          const prior = await stripe.transfers.list({
            transfer_group: booking.booking_reference,
            destination: accountId,
            limit: 10,
          })
          existing = prior.data[0]
          if (prior.data.length > 1) {
            console.error(
              `[Payouts] MULTIPLE transfers exist for transfer_group ${booking.booking_reference} — ` +
                `adopting ${prior.data[0].id}; investigate immediately`,
            )
          }
        } catch (err) {
          console.error(`[Payouts] transfers.list failed for booking ${booking.id} — not firing blind:`, err)
          counts.errors++
          continue
        }
        if (existing) {
          const { error } = await supabase
            .from('payouts')
            .update({
              stripe_transfer_id: existing.id,
              status: 'processing',
              processed_at: new Date().toISOString(),
              failure_reason: null,
            })
            .eq('id', payoutId)
          if (error) {
            console.error(`[Payouts] adopt update failed for payout ${payoutId} (transfer ${existing.id}):`, error)
            counts.errors++
          } else {
            console.info(`[Payouts] adopted existing transfer ${existing.id} for booking ${booking.id}`)
            counts.adopted++
          }
          continue
        }
      }

      let transfer: Stripe.Transfer
      try {
        transfer = await stripe.transfers.create(
          {
            amount: amountPence,
            currency: booking.currency.toLowerCase(),
            destination: accountId,
            transfer_group: booking.booking_reference,
            // Draws from the specific charge's balance (even while it is
            // still settling) instead of the platform's available balance —
            // prevents insufficient-balance failures (approved Step 0
            // clarification).
            source_transaction: chargeFee.chargeId,
            metadata: { booking_id: booking.id, payout_id: payoutId },
          },
          // The payout row UUID: stable per booking via migration 045, so a
          // re-fire for the same booking can only ever replay this transfer.
          { idempotencyKey: payoutId },
        )
      } catch (err) {
        console.error(
          `[Payouts] transfer create failed for booking ${booking.id} ` +
            `(payout ${payoutId}, attempt ${retryBase + 1}/${MAX_RETRY}):`,
          err,
        )
        const { error } = await supabase
          .from('payouts')
          .update({
            status: 'failed',
            failure_reason: errorMessage(err),
            retry_count: retryBase + 1,
          })
          .eq('id', payoutId)
        if (error) {
          console.error(`[Payouts] failed-state write failed for payout ${payoutId}:`, error)
        }
        counts.failed++
        continue
      }

      const { error: successError } = await supabase
        .from('payouts')
        .update({
          stripe_transfer_id: transfer.id,
          status: 'processing',
          processed_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq('id', payoutId)
      if (successError) {
        // The transfer DID fire; the row is still 'pending' with no transfer
        // id, so the ghost guard adopts it next run. Loud because the audit
        // trail is lagging reality until then.
        console.error(
          `[Payouts] transfer ${transfer.id} fired but payout ${payoutId} success update failed — ` +
            `ghost guard will adopt on the next run:`,
          successError,
        )
        counts.errors++
        continue
      }

      counts.transferred++
      console.info(
        `[Payouts] transferred ${amountPence}p ${booking.currency} to coach ${booking.coach_profile_id} ` +
          `for booking ${booking.id} (transfer ${transfer.id}, fee ${chargeFee.feePence}p)`,
      )
    } catch (err) {
      console.error(`[Payouts] unexpected error processing booking ${booking.id}:`, err)
      counts.errors++
    }
  }

  console.info(
    `[Payouts] run complete: checked=${counts.checked} transferred=${counts.transferred} ` +
      `adopted=${counts.adopted} released=${counts.released} held=${counts.held} ` +
      `failed=${counts.failed} skipped=${counts.skipped} errors=${counts.errors} parked=${counts.parked}`,
  )
  return NextResponse.json(counts)
}
