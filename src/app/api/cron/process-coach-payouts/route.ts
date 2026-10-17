// C-PAY-02 — GET /api/cron/process-coach-payouts
//
// The coach payout transfer job. Moves money owed to coaches from the Crikly
// Stripe account to their Connect account.
//
// Two kinds of payable (TECH-06):
//   booking   — a 1-to-1 or group booking row, once it has completed and the
//               BR-03 hold has passed (payout_eligible_at, stamped by C-PAY-01).
//   enrolment — a programme enrolment (group_programme_enrolments) whose
//               parent payment succeeded. Paid on the next hourly run, no hold
//               (BR-03, Decision T-16). Gated by PAYOUTS_ENROLMENTS_ENABLED:
//               unset = the job never queries enrolments and pays bookings
//               exactly as before TECH-06.
//
// BR-21: coach payout = gross coach amount − the ACTUAL Stripe fee, read from
// balance_transaction.fee on the real charge (expanded off the PaymentIntent)
// — never estimated, never a fixed rate. The gross is booking.coach_price_pence
// or enrolment.coach_amount_pence.
//
// Selection is starvation-proof by construction — settled work can never jam
// the batch, because no query can return it:
//   A.  Discovery (bookings) — completed, eligible bookings with NO payout
//       row yet (PostgREST anti-join: left-embed payouts + is-null filter).
//   B.  Work queue (bookings) — payout rows still owed action, per the
//       migration-043 contract: status IN ('pending','held') plus 'failed'
//       under the retry cap, due by scheduled_at, booking embedded !inner
//       (which also excludes enrolment rows by construction).
//   C.  Discovery (enrolments, flag-gated) — payment_status='succeeded',
//       platform-paid, not cancelled, programme live, NO payout row yet, and
//       no open needs_refund alert.
//   B2. Work queue (enrolments, flag-gated) — same status predicate as B over
//       rows with enrolment_id set, enrolment embedded !inner.
// Retry-exhausted rows are excluded from B/B2 so they cannot crowd the queue;
// their count is surfaced loudly every run (counts.parked) instead.
//
// Idempotency — one payable must never receive two transfers (three layers):
//   1. DB     — payouts.booking_id and payouts.enrolment_id are each UNIQUE
//               (migrations 045, 056), so the payout row UUID is stable per
//               payable forever.
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
// Enrolment safety (TECH-06): immediately before an enrolment transfer the
// enrolment is re-read; if it is no longer payable (cancelled, refunded,
// programme cancelled/deleted, open needs_refund alert) the row is parked —
// status 'failed', failure_reason 'enrolment_not_payable', retry_count at the
// cap — so it surfaces via counts.parked and never fires. Refunds and
// transfer reversals are out of scope here (REQ-C-056 / BR-17).
//
// Dry-run (TECH-06): ?dry_run=1 lists what the job WOULD pay — selection
// queries only, Stripe fee ESTIMATED, no Stripe call, no write. ?dry_run=stripe
// additionally reads the ACTUAL fee via paymentIntents.retrieve (read-only).
// Both modes return before the transfer loop is ever entered, and the dry-run
// code only ever receives a ReadonlyStripe (paymentIntents.retrieve) — a
// transfer cannot be created from it even by mistake.
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

// Bounds each selection query, so a run touches at most a few × BATCH_LIMIT
// rows (Stripe round-trips dominate). A backlog drains across subsequent
// runs, oldest money owed first — deferred, never dropped.
const BATCH_LIMIT = 50
// After this many failed transfer attempts a row parks (excluded from the
// work queue + loud parked count every run) until manually investigated.
// Retries happen hourly, so all five attempts land well inside Stripe's ~24h
// idempotency-key window.
const MAX_RETRY = 5
const FAILURE_REASON_MAX = 500
// Parked-row failure_reason for an enrolment that stopped being payable
// between selection and transfer (TECH-06). Parks at MAX_RETRY so the row is
// never re-selected; resolution belongs to the manual refund flow.
const ENROLMENT_NOT_PAYABLE = 'enrolment_not_payable'

/** TECH-06 feature flag — Lasith-owned on Vercel. Anything but "true" = off. */
function enrolmentsEnabled(): boolean {
  return process.env.PAYOUTS_ENROLMENTS_ENABLED === 'true'
}

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

interface ProgrammeEmbed {
  coach_profile_id: string
  status: string
  deleted_at: string | null
}

interface EnrolmentRow {
  id: string
  enrolment_reference: string | null
  coach_amount_pence: number | null
  parent_total_pence: number | null
  currency: string
  updated_at: string
  payment_status: string
  status: string
  payment_type: string
  group_programmes: ProgrammeEmbed | null
}

interface PayoutRow {
  id: string
  booking_id: string | null
  status: PayoutStatus
  retry_count: number
  stripe_transfer_id: string | null
  held_reason: PayoutHeldReason | null
}

interface QueueRow extends PayoutRow {
  bookings: BookingRow
}

interface EnrolmentQueueRow extends PayoutRow {
  enrolment_id: string
  group_programme_enrolments: EnrolmentRow
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

interface EnrolmentPaymentIntentRow {
  enrolment_id: string | null
  stripe_payment_intent_id: string
}

type PayableKind = 'booking' | 'enrolment'

/**
 * One unit of money owed to a coach. The per-row logic below is written
 * against this shape; the only kind-specific lines are the intent lookup,
 * the insert payload, the transfer metadata and the pre-transfer re-read.
 */
interface Payable {
  kind: PayableKind
  id: string
  /** Stripe transfer_group — booking_reference, or enrolment_reference /
   *  ENROL-<uuid> when the reference is null. */
  reference: string
  coachProfileId: string
  /** Gross coach amount in pence (coach_price_pence / coach_amount_pence). */
  grossPence: number
  /** Amount actually charged to the parent, when known (dry-run estimate). */
  chargedPence: number | null
  currency: string
  /** payouts.scheduled_at for a new row, and the oldest-first sort key. */
  eligibleAt: string
}

interface WorkItem {
  payable: Payable
  payout: PayoutRow | null
}

interface ChargeFee {
  chargeId: string
  feePence: number
}

/** The only Stripe surface the dry-run ever receives — no transfers at all. */
interface ReadonlyStripe {
  paymentIntents: { retrieve: Stripe['paymentIntents']['retrieve'] }
}

type DryRunMode = '1' | 'stripe'

/**
 * Resolves the actual Stripe fee (in pence) and the charge id for a
 * succeeded PaymentIntent by expanding latest_charge.balance_transaction.
 * Returns null when the expansion cannot be resolved to objects — which
 * should be impossible for a settled card charge and is treated as a loud
 * per-row error by the caller. BR-21: this fee is the only permitted source;
 * estimating is banned.
 */
async function resolveChargeFee(stripe: ReadonlyStripe, paymentIntentId: string): Promise<ChargeFee | null> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge.balance_transaction'],
  })
  const charge = intent.latest_charge
  if (!charge || typeof charge === 'string') return null
  const balanceTransaction = charge.balance_transaction
  if (!balanceTransaction || typeof balanceTransaction === 'string') return null
  return { chargeId: charge.id, feePence: balanceTransaction.fee }
}

/**
 * Dry-run ONLY: the UK Visa estimate (1.5% + 20p) on the amount charged, the
 * same formula coaches see in payout-estimate. Never feeds a transfer — the
 * real job always reads the actual fee off the charge (BR-21).
 */
function estimatedStripeFeePence(chargedPence: number): number {
  return Math.round((chargedPence * 15) / 1000) + 20
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, FAILURE_REASON_MAX)
}

function bookingPayable(booking: BookingRow): Payable {
  return {
    kind: 'booking',
    id: booking.id,
    reference: booking.booking_reference,
    coachProfileId: booking.coach_profile_id,
    grossPence: booking.coach_price_pence,
    chargedPence: null,
    currency: booking.currency,
    eligibleAt: booking.payout_eligible_at,
  }
}

function enrolmentReference(enrolment: Pick<EnrolmentRow, 'id' | 'enrolment_reference'>): string {
  return enrolment.enrolment_reference ?? `ENROL-${enrolment.id}`
}

/**
 * Why an enrolment must not be paid right now, or null when it is payable.
 * Shared by discovery, the dry-run listing and the pre-transfer re-read so
 * the three can never disagree.
 */
function enrolmentUnpayableReason(enrolment: EnrolmentRow, hasOpenRefundAlert: boolean): string | null {
  if (enrolment.payment_type !== 'platform') return 'offline_enrolment'
  if (enrolment.payment_status !== 'succeeded') return `payment_status_${enrolment.payment_status}`
  if (enrolment.status === 'cancelled') return 'enrolment_cancelled'
  if (!enrolment.group_programmes) return 'programme_missing'
  if (enrolment.group_programmes.deleted_at) return 'programme_deleted'
  if (enrolment.group_programmes.status === 'cancelled') return 'programme_cancelled'
  if (hasOpenRefundAlert) return 'open_needs_refund_alert'
  if (enrolment.coach_amount_pence === null || enrolment.coach_amount_pence <= 0) return 'no_coach_amount'
  return null
}

function enrolmentPayable(enrolment: EnrolmentRow): Payable {
  return {
    kind: 'enrolment',
    id: enrolment.id,
    reference: enrolmentReference(enrolment),
    // enrolmentUnpayableReason() guarantees the programme embed and a positive
    // amount before this is ever built.
    coachProfileId: enrolment.group_programmes?.coach_profile_id ?? '',
    grossPence: enrolment.coach_amount_pence ?? 0,
    chargedPence: enrolment.parent_total_pence,
    currency: enrolment.currency,
    // No hold for enrolments (BR-03 / T-16): due from the payment
    // confirmation — updated_at is stamped by confirm_programme_enrolment().
    eligibleAt: enrolment.updated_at,
  }
}

function workKey(kind: PayableKind, id: string): string {
  return `${kind}:${id}`
}

const ENROLMENT_SELECT =
  'id, enrolment_reference, coach_amount_pence, parent_total_pence, currency, updated_at, ' +
  'payment_status, status, payment_type, group_programmes!inner(coach_profile_id, status, deleted_at)'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Payouts] CRON_SECRET is not set')
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // new URL(request.url) rather than request.nextUrl so a plain Request (tests,
  // curl through a proxy) works identically.
  const dryRunParam = new URL(request.url).searchParams.get('dry_run')
  let dryRun: DryRunMode | null = null
  if (dryRunParam !== null) {
    if (dryRunParam !== '1' && dryRunParam !== 'stripe') {
      return NextResponse.json({ error: 'invalid_dry_run', allowed: ['1', 'stripe'] }, { status: 400 })
    }
    dryRun = dryRunParam
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
  const withEnrolments = enrolmentsEnabled()

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
    // be a live completed booking — and its presence excludes enrolment rows.
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

  // ── Enrolment selection (TECH-06) — only when the flag is on ─────────────
  // Runs AFTER the booking queries so a flag-off run issues exactly the same
  // calls, in the same order, as before TECH-06.
  let newEnrolments: EnrolmentRow[] = []
  let enrolmentQueue: EnrolmentQueueRow[] = []
  const openRefundAlerts = new Set<string>()
  const excludedEnrolments: Array<{ id: string; reference: string; reason: string }> = []

  if (withEnrolments) {
    const [enrolNewRes, enrolQueueRes] = await Promise.all([
      // Query C — discovery: paid enrolments the job has never touched.
      supabase
        .from('group_programme_enrolments')
        .select(`${ENROLMENT_SELECT}, payouts!left(id)`)
        .eq('payment_status', 'succeeded')
        .eq('payment_type', 'platform')
        .neq('status', 'cancelled')
        .is('group_programmes.deleted_at', null)
        .neq('group_programmes.status', 'cancelled')
        .is('payouts', null)
        .order('updated_at', { ascending: true })
        .limit(BATCH_LIMIT),
      // Query B2 — work queue: enrolment payout rows still owed action. The
      // enrolment is embedded regardless of its current state so a row whose
      // enrolment stopped being payable can be parked rather than linger.
      supabase
        .from('payouts')
        .select(
          'id, booking_id, enrolment_id, status, retry_count, stripe_transfer_id, held_reason, ' +
            `group_programme_enrolments!inner(${ENROLMENT_SELECT})`,
        )
        .not('enrolment_id', 'is', null)
        .or(`status.in.(pending,held),and(status.eq.failed,retry_count.lt.${MAX_RETRY})`)
        .lte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true })
        .limit(BATCH_LIMIT),
    ])

    if (enrolNewRes.error || enrolQueueRes.error) {
      console.error('[Payouts] enrolment candidate query failed:', enrolNewRes.error ?? enrolQueueRes.error)
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }

    newEnrolments = ((enrolNewRes.data ?? []) as unknown as Array<EnrolmentRow & { payouts: unknown }>).map(
      (row) => {
        const { payouts: _embed, ...enrolment } = row
        void _embed
        return enrolment
      },
    )
    enrolmentQueue = (enrolQueueRes.data ?? []) as unknown as EnrolmentQueueRow[]

    // An enrolment that was paid but got no spot (confirm_programme_enrolment
    // wrote a needs_refund alert) must never be paid out — the parent is owed
    // a refund, not the coach a transfer.
    const enrolmentIds = [
      ...new Set([...newEnrolments.map((e) => e.id), ...enrolmentQueue.map((q) => q.enrolment_id)]),
    ]
    if (enrolmentIds.length > 0) {
      const alertRes = await supabase
        .from('payment_alerts')
        .select('enrolment_id')
        .eq('kind', 'needs_refund')
        .eq('status', 'open')
        .in('enrolment_id', enrolmentIds)
      if (alertRes.error) {
        // Fail closed: without the alert list no enrolment is paid this run.
        console.error('[Payouts] needs_refund alert lookup failed — enrolments deferred this run:', alertRes.error)
        newEnrolments = []
        enrolmentQueue = []
      } else {
        for (const a of (alertRes.data ?? []) as Array<{ enrolment_id: string | null }>) {
          if (a.enrolment_id) openRefundAlerts.add(a.enrolment_id)
        }
      }
    }
  }

  // Merge into one work list, queue rows first on conflict (a race between a
  // row insert and query A/C can momentarily show a payable in both shapes).
  const queueRows = (queueRes.data ?? []) as unknown as QueueRow[]
  const newRows = (newRes.data ?? []) as unknown as Array<BookingRow & { payouts: unknown }>
  const work = new Map<string, WorkItem>()
  for (const row of queueRows) {
    const { bookings: booking, ...payout } = row
    work.set(workKey('booking', booking.id), { payable: bookingPayable(booking), payout })
  }
  for (const row of newRows) {
    const key = workKey('booking', row.id)
    if (!work.has(key)) {
      const { payouts: _embed, ...booking } = row
      void _embed
      work.set(key, { payable: bookingPayable(booking), payout: null })
    }
  }
  for (const row of enrolmentQueue) {
    const { group_programme_enrolments: enrolment, enrolment_id: _eid, ...payout } = row
    void _eid
    // Queue rows are always carried: an unpayable one is parked in the loop.
    work.set(workKey('enrolment', enrolment.id), { payable: enrolmentPayable(enrolment), payout })
  }
  for (const enrolment of newEnrolments) {
    const key = workKey('enrolment', enrolment.id)
    if (work.has(key)) continue
    const reason = enrolmentUnpayableReason(enrolment, openRefundAlerts.has(enrolment.id))
    if (reason) {
      excludedEnrolments.push({ id: enrolment.id, reference: enrolmentReference(enrolment), reason })
      console.info(`[Payouts] enrolment ${enrolment.id} not payable (${reason}) — skipped, no row written`)
      continue
    }
    work.set(key, { payable: enrolmentPayable(enrolment), payout: null })
  }
  // Oldest money owed first across every source.
  const items = [...work.values()].sort((a, b) => a.payable.eligibleAt.localeCompare(b.payable.eligibleAt))

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

  if (items.length === 0 && dryRun === null) {
    return NextResponse.json(counts)
  }

  const bookingIds = items.filter((i) => i.payable.kind === 'booking').map((i) => i.payable.id)
  const enrolmentIds = items.filter((i) => i.payable.kind === 'enrolment').map((i) => i.payable.id)
  const coachIds = [...new Set(items.map((i) => i.payable.coachProfileId))]

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

  // Enrolment intents (flag-gated by construction: enrolmentIds is empty
  // unless the flag is on). Unlike bookings, TWO succeeded intents for one
  // enrolment is treated as an anomaly — pay nothing, investigate — because
  // UNIQUE(enrolment_id) means only one transfer can ever be recorded.
  const piByEnrolment = new Map<string, EnrolmentPaymentIntentRow>()
  const duplicateIntentEnrolments = new Set<string>()
  if (enrolmentIds.length > 0) {
    const enrolPiRes = await supabase
      .from('payment_intents')
      .select('enrolment_id, stripe_payment_intent_id')
      .in('enrolment_id', enrolmentIds)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: true })
    if (enrolPiRes.error) {
      console.error('[Payouts] enrolment payment_intents lookup failed:', enrolPiRes.error)
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }
    for (const pi of (enrolPiRes.data ?? []) as EnrolmentPaymentIntentRow[]) {
      if (!pi.enrolment_id) continue
      if (piByEnrolment.has(pi.enrolment_id)) duplicateIntentEnrolments.add(pi.enrolment_id)
      piByEnrolment.set(pi.enrolment_id, pi)
    }
  }

  function intentFor(payable: Payable): { stripe_payment_intent_id: string } | null {
    if (payable.kind === 'booking') return piByBooking.get(payable.id) ?? null
    if (duplicateIntentEnrolments.has(payable.id)) return null
    return piByEnrolment.get(payable.id) ?? null
  }

  // ── Dry-run: list, never write, never transfer ─────────────────────────────
  if (dryRun !== null) {
    return NextResponse.json(await buildDryRun(dryRun, items, excludedEnrolments, coachById, intentFor, stripe, {
      withEnrolments,
      parked,
      duplicateIntentEnrolments,
    }))
  }

  for (const { payable, payout } of items) {
    const label = `${payable.kind} ${payable.id}`
    // Per-row isolation: nothing thrown for one payable may stop the rest.
    try {
      // Belt-and-braces guards — the selection queries already exclude these
      // shapes; if one slips through (query drift, race), never fire again.
      if (payout && (payout.status === 'processing' || payout.status === 'paid')) {
        counts.skipped++
        continue
      }
      if (payout && payout.status === 'failed' && payout.retry_count >= MAX_RETRY) {
        console.error(
          `[Payouts] payout ${payout.id} (${label}) has exhausted ` +
            `${MAX_RETRY} transfer attempts — parked; needs manual investigation`,
        )
        counts.skipped++
        continue
      }

      const coach = coachById.get(payable.coachProfileId)
      if (!coach) {
        console.error(
          `[Payouts] coach_profiles ${payable.coachProfileId} missing or deleted for ${label} — ` +
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
      // the real BR-21 amount → resolve the actual fee from the charge.
      const pi = intentFor(payable)
      if (!pi) {
        console.error(
          duplicateIntentEnrolments.has(payable.id)
            ? `[Payouts] ${label} has MORE THAN ONE succeeded payment_intents row — cannot pay out safely; investigate payment records`
            : `[Payouts] ${label} is completed but has no succeeded ` +
                `payment_intents row — cannot pay out; investigate payment records`,
        )
        counts.errors++
        continue
      }

      let chargeFee: ChargeFee | null
      try {
        chargeFee = await resolveChargeFee(stripe, pi.stripe_payment_intent_id)
      } catch (err) {
        console.error(`[Payouts] PaymentIntent retrieve failed for ${pi.stripe_payment_intent_id} (${label}):`, err)
        counts.errors++
        continue
      }
      if (!chargeFee) {
        console.error(
          `[Payouts] could not resolve latest_charge.balance_transaction for ` +
            `${pi.stripe_payment_intent_id} (${label}) — no payout without the actual fee (BR-21)`,
        )
        counts.errors++
        continue
      }

      const amountPence = payable.grossPence - chargeFee.feePence
      if (amountPence <= 0) {
        // Approved edge ruling: fee ≥ coach price → no row written (the
        // amount_pence > 0 CHECK would reject it anyway). Loud — an admin
        // must resolve this payable manually.
        console.error(
          `[Payouts] Stripe fee ${chargeFee.feePence}p >= coach price ${payable.grossPence}p ` +
            `for ${label} — skipping, no payout row written; needs admin`,
        )
        counts.skipped++
        continue
      }

      // Insert payload: exactly one of booking_id / enrolment_id (migration
      // 056 XOR). The booking shape is byte-identical to pre-TECH-06.
      const sourceColumns =
        payable.kind === 'booking' ? { booking_id: payable.id } : { enrolment_id: payable.id }

      if (heldReason) {
        // First sighting of an unpayable coach → write the held intent row.
        // It carries the real amount so what the coach is owed stays accurate
        // while held.
        const { error } = await supabase.from('payouts').insert({
          id: randomUUID(),
          ...sourceColumns,
          coach_profile_id: payable.coachProfileId,
          amount_pence: amountPence,
          currency: payable.currency,
          status: 'held',
          held_reason: heldReason,
          scheduled_at: payable.eligibleAt,
        })
        if (error) {
          if (error.code === '23505') {
            counts.skipped++ // concurrent run already wrote the row — its problem now
          } else {
            console.error(`[Payouts] held insert failed for ${label}:`, error)
            counts.errors++
          }
          continue
        }
        console.info(`[Payouts] held payout for ${label}: ${heldReason}`)
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
          console.info(`[Payouts] released held payout ${payout.id} (${label}) — Stripe now ready`)
        }
      } else {
        // Write intent FIRST: if the transfer fires and this insert had
        // failed, we'd have a ghost transfer with no audit trail. The UUID is
        // generated client-side so the Stripe idempotency key exists before
        // any money moves.
        payoutId = randomUUID()
        const { error } = await supabase.from('payouts').insert({
          id: payoutId,
          ...sourceColumns,
          coach_profile_id: payable.coachProfileId,
          amount_pence: amountPence,
          currency: payable.currency,
          status: 'pending',
          scheduled_at: payable.eligibleAt,
        })
        if (error) {
          if (error.code === '23505') {
            counts.skipped++ // concurrent run inserted first and owns this payable
          } else {
            console.error(`[Payouts] pending insert failed for ${label} — transfer NOT fired:`, error)
            counts.errors++
          }
          continue
        }
      }

      // TECH-06 pre-transfer re-read (enrolments only): the enrolment may
      // have been cancelled/refunded, or its programme cancelled, between
      // selection and now. Park the row rather than pay; refunds are manual.
      if (payable.kind === 'enrolment') {
        const { data: fresh, error: freshError } = await supabase
          .from('group_programme_enrolments')
          .select(ENROLMENT_SELECT)
          .eq('id', payable.id)
          .maybeSingle()
        if (freshError) {
          console.error(`[Payouts] pre-transfer re-read failed for ${label} — not firing blind:`, freshError)
          counts.errors++
          continue
        }
        const reason = fresh
          ? enrolmentUnpayableReason(fresh as unknown as EnrolmentRow, openRefundAlerts.has(payable.id))
          : 'enrolment_missing'
        if (reason) {
          const { error } = await supabase
            .from('payouts')
            .update({
              status: 'failed',
              failure_reason: `${ENROLMENT_NOT_PAYABLE}: ${reason}`.slice(0, FAILURE_REASON_MAX),
              retry_count: MAX_RETRY,
            })
            .eq('id', payoutId)
          if (error) {
            console.error(`[Payouts] park update failed for payout ${payoutId} (${label}):`, error)
            counts.errors++
          } else {
            console.error(
              `[Payouts] ${label} is no longer payable (${reason}) — payout ${payoutId} parked, ` +
                `no transfer fired; resolve via the manual refund flow`,
            )
            counts.failed++
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
            transfer_group: payable.reference,
            destination: accountId,
            limit: 10,
          })
          existing = prior.data[0]
          if (prior.data.length > 1) {
            console.error(
              `[Payouts] MULTIPLE transfers exist for transfer_group ${payable.reference} — ` +
                `adopting ${prior.data[0].id}; investigate immediately`,
            )
          }
        } catch (err) {
          console.error(`[Payouts] transfers.list failed for ${label} — not firing blind:`, err)
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
            console.info(`[Payouts] adopted existing transfer ${existing.id} for ${label}`)
            counts.adopted++
          }
          continue
        }
      }

      const metadata: Record<string, string> =
        payable.kind === 'booking'
          ? { booking_id: payable.id, payout_id: payoutId }
          : { enrolment_id: payable.id, payout_id: payoutId }

      let transfer: Stripe.Transfer
      try {
        transfer = await stripe.transfers.create(
          {
            amount: amountPence,
            currency: payable.currency.toLowerCase(),
            destination: accountId,
            transfer_group: payable.reference,
            // Draws from the specific charge's balance (even while it is
            // still settling) instead of the platform's available balance —
            // prevents insufficient-balance failures (approved Step 0
            // clarification).
            source_transaction: chargeFee.chargeId,
            metadata,
          },
          // The payout row UUID: stable per payable via migrations 045/056,
          // so a re-fire for the same payable can only ever replay this
          // transfer.
          { idempotencyKey: payoutId },
        )
      } catch (err) {
        console.error(
          `[Payouts] transfer create failed for ${label} ` +
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
        `[Payouts] transferred ${amountPence}p ${payable.currency} to coach ${payable.coachProfileId} ` +
          `for ${label} (transfer ${transfer.id}, fee ${chargeFee.feePence}p)`,
      )
    } catch (err) {
      console.error(`[Payouts] unexpected error processing ${label}:`, err)
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

// ── Dry-run listing (TECH-06) ─────────────────────────────────────────────────

type DryRunAction = 'transfer' | 'hold' | 'skip' | 'adopt_or_transfer' | 'error'

interface DryRunCandidate {
  kind: PayableKind
  id: string
  reference: string
  coach_profile_id: string
  stripe_account_connected: boolean
  stripe_onboarding_complete: boolean
  gross_pence: number
  currency: string
  fee_pence: number | null
  fee_source: 'estimated' | 'stripe' | null
  net_pence: number | null
  existing_payout: { id: string; status: PayoutStatus; retry_count: number } | null
  would: DryRunAction
  reason: string | null
}

/**
 * Builds the dry-run listing. Receives ONLY a ReadonlyStripe — there is no
 * transfers surface on that type, so this function cannot move money, and
 * it holds no Supabase client, so it cannot write. Mode 'stripe' reads the
 * actual fee per candidate via paymentIntents.retrieve (read-only); mode '1'
 * estimates it.
 */
async function buildDryRun(
  mode: DryRunMode,
  items: WorkItem[],
  excluded: Array<{ id: string; reference: string; reason: string }>,
  coachById: Map<string, CoachRow>,
  intentFor: (payable: Payable) => { stripe_payment_intent_id: string } | null,
  stripe: ReadonlyStripe,
  extra: { withEnrolments: boolean; parked: number; duplicateIntentEnrolments: Set<string> },
): Promise<{
  dry_run: DryRunMode
  enrolments_enabled: boolean
  fee_source: 'estimated' | 'stripe'
  candidates: DryRunCandidate[]
  excluded_enrolments: Array<{ id: string; reference: string; reason: string }>
  parked: number
}> {
  const candidates: DryRunCandidate[] = []

  for (const { payable, payout } of items) {
    const coach = coachById.get(payable.coachProfileId) ?? null
    const connected = !!coach?.stripe_account_id
    const onboarded = coach?.stripe_onboarding_complete === true
    const base: Omit<DryRunCandidate, 'fee_pence' | 'fee_source' | 'net_pence' | 'would' | 'reason'> = {
      kind: payable.kind,
      id: payable.id,
      reference: payable.reference,
      coach_profile_id: payable.coachProfileId,
      stripe_account_connected: connected,
      stripe_onboarding_complete: onboarded,
      gross_pence: payable.grossPence,
      currency: payable.currency,
      existing_payout: payout ? { id: payout.id, status: payout.status, retry_count: payout.retry_count } : null,
    }

    if (payout && (payout.status === 'processing' || payout.status === 'paid')) {
      candidates.push({ ...base, fee_pence: null, fee_source: null, net_pence: null, would: 'skip', reason: `already_${payout.status}` })
      continue
    }
    if (payout && payout.status === 'failed' && payout.retry_count >= MAX_RETRY) {
      candidates.push({ ...base, fee_pence: null, fee_source: null, net_pence: null, would: 'skip', reason: 'parked_retry_exhausted' })
      continue
    }
    if (!coach) {
      candidates.push({ ...base, fee_pence: null, fee_source: null, net_pence: null, would: 'error', reason: 'coach_missing_or_deleted' })
      continue
    }

    const pi = intentFor(payable)
    if (!pi) {
      candidates.push({
        ...base,
        fee_pence: null,
        fee_source: null,
        net_pence: null,
        would: 'error',
        reason: extra.duplicateIntentEnrolments.has(payable.id) ? 'multiple_succeeded_intents' : 'no_succeeded_intent',
      })
      continue
    }

    let feePence: number | null
    let feeSource: 'estimated' | 'stripe'
    if (mode === 'stripe') {
      feeSource = 'stripe'
      try {
        const fee = await resolveChargeFee(stripe, pi.stripe_payment_intent_id)
        feePence = fee?.feePence ?? null
      } catch {
        feePence = null
      }
      if (feePence === null) {
        candidates.push({ ...base, fee_pence: null, fee_source: feeSource, net_pence: null, would: 'error', reason: 'fee_unresolvable' })
        continue
      }
    } else {
      feeSource = 'estimated'
      feePence = estimatedStripeFeePence(payable.chargedPence ?? payable.grossPence)
    }

    const netPence = payable.grossPence - feePence
    if (netPence <= 0) {
      candidates.push({ ...base, fee_pence: feePence, fee_source: feeSource, net_pence: netPence, would: 'skip', reason: 'fee_gte_gross' })
      continue
    }

    const heldReason: PayoutHeldReason | null = !connected
      ? 'no_stripe_account'
      : !onboarded
        ? 'stripe_onboarding_incomplete'
        : null
    if (heldReason) {
      candidates.push({ ...base, fee_pence: feePence, fee_source: feeSource, net_pence: netPence, would: 'hold', reason: heldReason })
      continue
    }

    candidates.push({
      ...base,
      fee_pence: feePence,
      fee_source: feeSource,
      net_pence: netPence,
      would: payout && !payout.stripe_transfer_id ? 'adopt_or_transfer' : 'transfer',
      reason: null,
    })
  }

  return {
    dry_run: mode,
    enrolments_enabled: extra.withEnrolments,
    fee_source: mode === 'stripe' ? 'stripe' : 'estimated',
    candidates,
    excluded_enrolments: excluded,
    parked: extra.parked,
  }
}
