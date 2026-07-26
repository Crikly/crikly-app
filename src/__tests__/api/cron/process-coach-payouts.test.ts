// Integration tests for GET /api/cron/process-coach-payouts (C-PAY-02)
//
// All external dependencies mocked:
//   - @/lib/supabase/admin → createAdminClient
//   - @/lib/stripe/client  → getStripe
//
// The transfer job's contract under test:
//   - CRON_SECRET Bearer auth (500 unconfigured, 401 missing/wrong) —
//     mirrors the other cron routes.
//   - BR-02 exactness: transfer amount = coach_price_pence − the ACTUAL
//     balance_transaction.fee from the expanded charge — never estimated.
//   - Write-intent-first: the payout row insert precedes transfers.create,
//     and an insert failure means NO transfer fires.
//   - Idempotency: the Stripe idempotency key is the payout row UUID;
//     'processing'/'paid' rows never fire again (belt-and-braces — the work
//     queue query excludes them at the DB level too).
//   - Held-payout contract (C-PAY-03): no_stripe_account /
//     stripe_onboarding_incomplete rows hold with no retry_count increment
//     and no failure_reason; ongoing holds cost zero Stripe calls; release
//     clears held_reason in the same update and transfers in the same run.
//   - Failure isolation: one row's Stripe failure marks that row failed
//     (failure_reason + retry_count) and the loop continues; MAX_RETRY=5
//     parks the row (excluded from the queue, surfaced via counts.parked).
//   - Ghost-transfer reconcile guard: pre-existing rows with no
//     stripe_transfer_id adopt an existing transfer from
//     transfers.list(transfer_group) instead of re-firing.
//   - Fee ≥ coach price edge: skip loudly, no row written.
//
// Selection is starvation-proof by construction (settled rows can't jam the
// batch) — that property lives in the WHERE clauses of the two candidate
// queries and is asserted here only at the belt-and-braces level; the query
// shapes themselves are exercised against the local DB, not these mocks.

// ── Module mocks (must appear before any imports) ─────────────────────────────

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import { GET } from '@/app/api/cron/process-coach-payouts/route'

type MockFn = jest.Mock

// ── Supabase chain builder ────────────────────────────────────────────────────
//
// Every route query awaits the builder directly (no .single()), so the chain
// is thenable and resolves to { data, error, count } wherever the await lands
// (same pattern as release-expired-bookings.test.ts). Method mocks are
// inspected by tests to assert on insert/update payloads.

function makeChain(result: { data?: unknown; error?: unknown; count?: number } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null, count: result.count ?? null }
  const chain: Record<string, MockFn> & { then?: unknown } = {}
  for (const m of ['select', 'eq', 'is', 'in', 'lte', 'gte', 'or', 'order', 'limit', 'insert', 'update']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(resolved)
  return chain
}

type Chain = ReturnType<typeof makeChain>

/**
 * Table-keyed from() dispatcher. Each table gets a queue of chains consumed
 * in call order; the last chain is sticky so repeated calls reuse it. An
 * unexpected table throws, failing the test loudly.
 */
function mockFromTables(map: Record<string, Chain[]>) {
  const queues = new Map(Object.entries(map).map(([k, v]) => [k, [...v]]))
  return jest.fn((table: string) => {
    const q = queues.get(table)
    if (!q || q.length === 0) throw new Error(`unexpected from('${table}')`)
    return q.length > 1 ? q.shift() : q[0]
  })
}

function adminClient(from: unknown) {
  ;(createAdminClient as MockFn).mockReturnValue({ from })
}

// ── Stripe mock builder ───────────────────────────────────────────────────────

const CHARGE_ID = 'ch_pay_1'
const STRIPE_FEE = 113 // 1.4% + 20p on £66.00 — the payments-engineer.md worked example

function makeStripeMock(over: {
  fee?: number
  latestCharge?: unknown
  retrieveRejects?: boolean
  createRejects?: boolean
  listData?: Array<{ id: string }>
  listRejects?: boolean
} = {}) {
  const stripe = {
    paymentIntents: {
      retrieve: over.retrieveRejects
        ? jest.fn().mockRejectedValue(new Error('No such payment_intent'))
        : jest.fn().mockResolvedValue({
            id: 'pi_pay_1',
            latest_charge:
              'latestCharge' in over
                ? over.latestCharge
                : { id: CHARGE_ID, balance_transaction: { id: 'txn_pay_1', fee: over.fee ?? STRIPE_FEE } },
          }),
    },
    transfers: {
      list: over.listRejects
        ? jest.fn().mockRejectedValue(new Error('rate limited'))
        : jest.fn().mockResolvedValue({ data: over.listData ?? [] }),
      create: over.createRejects
        ? jest.fn().mockRejectedValue(new Error('Insufficient funds in Stripe balance'))
        : jest.fn().mockResolvedValue({ id: 'tr_pay_1' }),
    },
  }
  ;(getStripe as MockFn).mockReturnValue(stripe)
  return stripe
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BOOKING_ID = 'booking-pay-uuid-1'
const COACH_ID = 'coach-profile-uuid-1'
const PAYOUT_ID = 'payout-row-uuid-1'
const ACCOUNT_ID = 'acct_coach_1'
const COACH_PRICE = 6000 // £60.00

function bookingRow(over: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    booking_reference: 'CRK-2026-0001',
    coach_profile_id: COACH_ID,
    coach_price_pence: COACH_PRICE,
    currency: 'GBP',
    payout_eligible_at: '2026-07-24T10:00:00.000Z',
    ...over,
  }
}

function coachRow(over: Record<string, unknown> = {}) {
  return {
    id: COACH_ID,
    stripe_account_id: ACCOUNT_ID,
    stripe_onboarding_complete: true,
    ...over,
  }
}

/** A query-B work-queue row: a payout row with its booking embedded. */
function queueRow(payoutOver: Record<string, unknown> = {}, bookingOver: Record<string, unknown> = {}) {
  return {
    id: PAYOUT_ID,
    booking_id: BOOKING_ID,
    status: 'pending',
    retry_count: 0,
    stripe_transfer_id: null,
    held_reason: null,
    ...payoutOver,
    bookings: bookingRow(bookingOver),
  }
}

function piRow(over: Record<string, unknown> = {}) {
  return {
    booking_id: BOOKING_ID,
    stripe_payment_intent_id: 'pi_pay_1',
    ...over,
  }
}

/**
 * Standard scenario. Returns the payouts write chains so tests can assert on
 * insert/update payloads. Queue shape per table:
 *   bookings         → query A (discovery: eligible bookings, no payout row)
 *   payouts          → query B (work queue), parked count, then writes
 *                      (writes chain is sticky)
 *   coach_profiles   → batch select
 *   payment_intents  → batch select
 */
function scenario(opts: {
  newBookings?: unknown[]
  queue?: unknown[]
  parkedCount?: number
  coaches?: unknown[]
  pis?: unknown[]
  writeChains?: Chain[]
} = {}) {
  const writes = opts.writeChains ?? [makeChain()]
  const from = mockFromTables({
    bookings: [makeChain({ data: opts.newBookings ?? [] })],
    payouts: [
      makeChain({ data: opts.queue ?? [] }),
      makeChain({ count: opts.parkedCount ?? 0 }),
      ...writes,
    ],
    coach_profiles: [makeChain({ data: opts.coaches ?? [coachRow()] })],
    payment_intents: [makeChain({ data: opts.pis ?? [piRow()] })],
  })
  adminClient(from)
  return { from, writes }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CRON_SECRET = 'test-cron-secret'

async function callGet(auth: string | null = `Bearer ${CRON_SECRET}`) {
  const headers: Record<string, string> = {}
  if (auth !== null) headers.authorization = auth
  const request = new Request('http://localhost/api/cron/process-coach-payouts', {
    method: 'GET',
    headers,
  })
  return GET(request as Parameters<typeof GET>[0])
}

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV, CRON_SECRET }
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  jest.spyOn(console, 'info').mockImplementation(() => undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /api/cron/process-coach-payouts — auth', () => {
  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const { from } = scenario()
    makeStripeMock()

    const res = await callGet()
    expect(res.status).toBe(500)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns 401 without an authorization header', async () => {
    const { from } = scenario()
    makeStripeMock()

    const res = await callGet(null)
    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns 401 on a wrong bearer token', async () => {
    const { from } = scenario()
    makeStripeMock()

    const res = await callGet('Bearer wrong-secret')
    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })
})

// ── Happy path ────────────────────────────────────────────────────────────────

describe('GET /api/cron/process-coach-payouts — transfer', () => {
  it('pays coach_price minus the ACTUAL balance_transaction fee (BR-02)', async () => {
    const insertChain = makeChain()
    const updateChain = makeChain()
    scenario({ newBookings: [bookingRow()], writeChains: [insertChain, updateChain] })
    const stripe = makeStripeMock({ fee: STRIPE_FEE })

    const res = await callGet()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ checked: 1, transferred: 1, failed: 0, errors: 0 })

    // The actual fee came off the expanded charge, not an estimate.
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_pay_1', {
      expand: ['latest_charge.balance_transaction'],
    })

    const [params, options] = stripe.transfers.create.mock.calls[0]
    expect(params.amount).toBe(COACH_PRICE - STRIPE_FEE) // 6000 − 113 = 5887
    expect(params.currency).toBe('gbp') // Stripe demands lowercase
    expect(params.destination).toBe(ACCOUNT_ID)
    expect(params.transfer_group).toBe('CRK-2026-0001')
    expect(params.source_transaction).toBe(CHARGE_ID)

    // Write-intent-first: pending row inserted with the id used as the key.
    const inserted = insertChain.insert.mock.calls[0][0]
    expect(inserted.status).toBe('pending')
    expect(inserted.amount_pence).toBe(5887)
    expect(inserted.booking_id).toBe(BOOKING_ID)
    expect(options.idempotencyKey).toBe(inserted.id)

    // Success: transfer id recorded, status processing, processed_at stamped.
    const updated = updateChain.update.mock.calls[0][0]
    expect(updated).toMatchObject({ stripe_transfer_id: 'tr_pay_1', status: 'processing', failure_reason: null })
    expect(updated.processed_at).toEqual(expect.any(String))
  })

  it('fires NO transfer when the intent-row insert fails (write-intent-first)', async () => {
    const insertChain = makeChain({ error: { code: '500', message: 'db down' } })
    scenario({ newBookings: [bookingRow()], writeChains: [insertChain] })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ transferred: 0, errors: 1 })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('skips the booking when a concurrent run already inserted the row (23505)', async () => {
    const insertChain = makeChain({ error: { code: '23505', message: 'duplicate key' } })
    scenario({ newBookings: [bookingRow()], writeChains: [insertChain] })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ transferred: 0, skipped: 1, errors: 0 })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('never fires for a payout already processing (belt-and-braces guard)', async () => {
    scenario({ queue: [queueRow({ status: 'processing', stripe_transfer_id: 'tr_done' })] })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ skipped: 1, transferred: 0 })
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('skips loudly with no row written when the fee is >= coach price', async () => {
    const insertChain = makeChain()
    scenario({ newBookings: [bookingRow({ coach_price_pence: 100 })], writeChains: [insertChain] })
    const stripe = makeStripeMock({ fee: 113 })

    const res = await callGet()
    expect(await res.json()).toMatchObject({ skipped: 1, transferred: 0, failed: 0 })
    expect(insertChain.insert).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('needs admin'))
  })

  it('errors the row (never estimates) when balance_transaction cannot be expanded', async () => {
    const insertChain = makeChain()
    scenario({ newBookings: [bookingRow()], writeChains: [insertChain] })
    const stripe = makeStripeMock({ latestCharge: { id: CHARGE_ID, balance_transaction: 'txn_unexpanded' } })

    const res = await callGet()
    expect(await res.json()).toMatchObject({ errors: 1, transferred: 0 })
    expect(insertChain.insert).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })
})

// ── Held-payout contract (C-PAY-03) ──────────────────────────────────────────

describe('GET /api/cron/process-coach-payouts — held contract', () => {
  it('holds with no_stripe_account when the coach has no Stripe account', async () => {
    const insertChain = makeChain()
    scenario({
      newBookings: [bookingRow()],
      coaches: [coachRow({ stripe_account_id: null })],
      writeChains: [insertChain],
    })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ held: 1, transferred: 0, failed: 0 })

    const inserted = insertChain.insert.mock.calls[0][0]
    expect(inserted.status).toBe('held')
    expect(inserted.held_reason).toBe('no_stripe_account')
    // A hold is NOT a failure: no retry_count, no failure_reason written.
    expect(inserted.retry_count).toBeUndefined()
    expect(inserted.failure_reason).toBeUndefined()
    expect(inserted.amount_pence).toBe(COACH_PRICE - STRIPE_FEE) // real BR-02 amount even while held
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('holds with stripe_onboarding_incomplete when onboarding is unfinished', async () => {
    const insertChain = makeChain()
    scenario({
      newBookings: [bookingRow()],
      coaches: [coachRow({ stripe_onboarding_complete: false })],
      writeChains: [insertChain],
    })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ held: 1, transferred: 0 })
    expect(insertChain.insert.mock.calls[0][0].held_reason).toBe('stripe_onboarding_incomplete')
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('re-evaluates an ongoing hold with zero Stripe calls and zero writes', async () => {
    const writeChain = makeChain()
    scenario({
      queue: [queueRow({ status: 'held', held_reason: 'no_stripe_account' })],
      coaches: [coachRow({ stripe_account_id: null })],
      writeChains: [writeChain],
    })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ held: 1, errors: 0 })
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(writeChain.update).not.toHaveBeenCalled()
    expect(writeChain.insert).not.toHaveBeenCalled()
  })

  it('releases a held row and transfers in the same run once Stripe is ready', async () => {
    const releaseChain = makeChain()
    const successChain = makeChain()
    scenario({
      queue: [queueRow({ status: 'held', held_reason: 'no_stripe_account' })],
      writeChains: [releaseChain, successChain],
    })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ released: 1, transferred: 1, held: 0 })

    // held_reason cleared in the SAME update that leaves 'held'
    // (held_reason_iff_held biconditional).
    expect(releaseChain.update.mock.calls[0][0]).toEqual({ status: 'pending', held_reason: null })

    // The transfer reuses the held row's UUID as the idempotency key.
    expect(stripe.transfers.create.mock.calls[0][1]).toEqual({ idempotencyKey: PAYOUT_ID })
    expect(successChain.update.mock.calls[0][0]).toMatchObject({ stripe_transfer_id: 'tr_pay_1', status: 'processing' })
  })

  it('re-holds a pending row whose coach lost Stripe readiness', async () => {
    const holdChain = makeChain()
    scenario({
      queue: [queueRow({ status: 'pending' })],
      coaches: [coachRow({ stripe_onboarding_complete: false })],
      writeChains: [holdChain],
    })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ held: 1, transferred: 0 })
    expect(holdChain.update.mock.calls[0][0]).toEqual({
      status: 'held',
      held_reason: 'stripe_onboarding_incomplete',
      failure_reason: null,
    })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })
})

// ── Failure handling & isolation ─────────────────────────────────────────────

describe('GET /api/cron/process-coach-payouts — failures', () => {
  it('marks the row failed with reason + retry_count and keeps processing other rows', async () => {
    const bookingA = bookingRow()
    const bookingB = bookingRow({ id: 'booking-pay-uuid-2', booking_reference: 'CRK-2026-0002' })
    const writeChain = makeChain()
    scenario({
      newBookings: [bookingA, bookingB],
      pis: [piRow(), piRow({ booking_id: 'booking-pay-uuid-2', stripe_payment_intent_id: 'pi_pay_2' })],
      writeChains: [writeChain],
    })
    const stripe = makeStripeMock()
    stripe.transfers.create
      .mockRejectedValueOnce(new Error('Insufficient funds in Stripe balance'))
      .mockResolvedValueOnce({ id: 'tr_pay_2' })

    const res = await callGet()
    // One failure must not stop the other row: booking B still transfers.
    expect(await res.json()).toMatchObject({ checked: 2, failed: 1, transferred: 1 })
    expect(stripe.transfers.create).toHaveBeenCalledTimes(2)

    const failedWrite = writeChain.update.mock.calls.find((c) => c[0].status === 'failed')
    expect(failedWrite?.[0]).toMatchObject({
      status: 'failed',
      failure_reason: 'Insufficient funds in Stripe balance',
      retry_count: 1,
    })
  })

  it('retries a failed row reusing the SAME row UUID as the idempotency key', async () => {
    const writeChain = makeChain()
    scenario({
      queue: [queueRow({ status: 'failed', retry_count: 2 })],
      writeChains: [writeChain],
    })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ transferred: 1, failed: 0 })
    // Same row, same key — a duplicate transfer is impossible.
    expect(stripe.transfers.create.mock.calls[0][1]).toEqual({ idempotencyKey: PAYOUT_ID })
    // Success clears the stale failure_reason.
    expect(writeChain.update.mock.calls[0][0]).toMatchObject({ status: 'processing', failure_reason: null })
  })

  it('parks a retry-exhausted row that slips into the queue (belt-and-braces)', async () => {
    scenario({ queue: [queueRow({ status: 'failed', retry_count: 5 })] })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ skipped: 1, transferred: 0, failed: 0 })
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('manual investigation'))
  })

  it('surfaces the parked count loudly in every run', async () => {
    scenario({ parkedCount: 3 })
    makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ parked: 3, checked: 0 })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('3 payout(s) parked'))
  })

  it('increments retry_count from the existing row on a repeat failure', async () => {
    const writeChain = makeChain()
    scenario({
      queue: [queueRow({ status: 'failed', retry_count: 3 })],
      writeChains: [writeChain],
    })
    makeStripeMock({ createRejects: true })

    const res = await callGet()
    expect(await res.json()).toMatchObject({ failed: 1 })
    const failedWrite = writeChain.update.mock.calls.find((c) => c[0].status === 'failed')
    expect(failedWrite?.[0].retry_count).toBe(4)
  })
})

// ── Ghost-transfer reconcile guard ───────────────────────────────────────────

describe('GET /api/cron/process-coach-payouts — ghost guard', () => {
  it('adopts an existing transfer instead of re-firing for a crashed pending row', async () => {
    const adoptChain = makeChain()
    scenario({
      queue: [queueRow({ status: 'pending' })],
      writeChains: [adoptChain],
    })
    const stripe = makeStripeMock({ listData: [{ id: 'tr_ghost_1' }] })

    const res = await callGet()
    expect(await res.json()).toMatchObject({ adopted: 1, transferred: 0 })

    expect(stripe.transfers.list).toHaveBeenCalledWith({
      transfer_group: 'CRK-2026-0001',
      destination: ACCOUNT_ID,
      limit: 10,
    })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(adoptChain.update.mock.calls[0][0]).toMatchObject({
      stripe_transfer_id: 'tr_ghost_1',
      status: 'processing',
    })
  })

  it('creates normally when the guard finds no prior transfer', async () => {
    const successChain = makeChain()
    scenario({
      queue: [queueRow({ status: 'pending' })],
      writeChains: [successChain],
    })
    const stripe = makeStripeMock({ listData: [] })

    const res = await callGet()
    expect(await res.json()).toMatchObject({ transferred: 1, adopted: 0 })
    expect(stripe.transfers.list).toHaveBeenCalledTimes(1)
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1)
  })

  it('does not fire blind when transfers.list fails', async () => {
    scenario({ queue: [queueRow({ status: 'pending' })] })
    const stripe = makeStripeMock({ listRejects: true })

    const res = await callGet()
    expect(await res.json()).toMatchObject({ errors: 1, transferred: 0 })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('skips the guard for brand-new rows (no wasted Stripe call)', async () => {
    scenario({ newBookings: [bookingRow()] })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ transferred: 1 })
    expect(stripe.transfers.list).not.toHaveBeenCalled()
  })
})

// ── Run shape ─────────────────────────────────────────────────────────────────

describe('GET /api/cron/process-coach-payouts — run shape', () => {
  it('returns zero counts when nothing is eligible', async () => {
    scenario()
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ checked: 0, transferred: 0, parked: 0 })
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
  })

  it('returns 500 internal_error when the discovery query fails', async () => {
    const from = mockFromTables({
      bookings: [makeChain({ error: { message: 'db down' } })],
      payouts: [makeChain({ data: [] }), makeChain({ count: 0 })],
    })
    adminClient(from)
    makeStripeMock()

    const res = await callGet()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error' })
  })

  it('returns 500 internal_error when the work-queue query fails', async () => {
    const from = mockFromTables({
      bookings: [makeChain({ data: [] })],
      payouts: [makeChain({ error: { message: 'db down' } }), makeChain({ count: 0 })],
    })
    adminClient(from)
    makeStripeMock()

    const res = await callGet()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error' })
  })

  it('deduplicates a booking that appears in both queries (queue row wins)', async () => {
    const writeChain = makeChain()
    scenario({
      newBookings: [bookingRow()],
      queue: [queueRow({ status: 'pending' })],
      writeChains: [writeChain],
    })
    const stripe = makeStripeMock()

    const res = await callGet()
    // One work item, treated as the pre-existing pending row (ghost guard
    // runs), never as a fresh insert.
    expect(await res.json()).toMatchObject({ checked: 1, transferred: 1 })
    expect(writeChain.insert).not.toHaveBeenCalled()
    expect(stripe.transfers.list).toHaveBeenCalledTimes(1)
    expect(stripe.transfers.create.mock.calls[0][1]).toEqual({ idempotencyKey: PAYOUT_ID })
  })

  it('errors loudly when a completed booking has no succeeded payment intent', async () => {
    scenario({ newBookings: [bookingRow()], pis: [] })
    const stripe = makeStripeMock()

    const res = await callGet()
    expect(await res.json()).toMatchObject({ errors: 1, transferred: 0 })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('no succeeded'))
  })
})
