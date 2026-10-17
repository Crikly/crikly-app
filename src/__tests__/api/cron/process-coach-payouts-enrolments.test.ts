// TECH-06 — programme-enrolment payouts in GET /api/cron/process-coach-payouts
//
// Contract under test (see route header):
//   - PAYOUTS_ENROLMENTS_ENABLED unset → the run is byte-identical to the
//     pre-TECH-06 job: same response, and the enrolment tables are NEVER
//     queried (the strict from() dispatcher throws on them).
//   - Flag on → a succeeded, platform-paid, non-cancelled enrolment with no
//     payout row pays coach_amount_pence − the ACTUAL balance_transaction.fee,
//     with enrolment_id set (never booking_id), no hold, transfer_group =
//     enrolment_reference (ENROL-<uuid> when null), idempotency key = row UUID.
//   - Exclusions never write a row or fire: offline, not succeeded, cancelled,
//     refunded, programme cancelled/deleted, open needs_refund alert, no
//     coach amount, no / multiple succeeded intents, fee ≥ amount.
//   - Pre-transfer re-read parks a row whose enrolment stopped being payable.
//   - Held contract, ghost guard, processing/paid skip and 23505 skip apply
//     to enrolment rows exactly as to bookings.
//   - Dry-run (?dry_run=1 / ?dry_run=stripe): lists, never writes, never
//     transfers, never lists transfers; 'stripe' mode reads the fee only.

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/stripe/client', () => ({ getStripe: jest.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import { GET } from '@/app/api/cron/process-coach-payouts/route'
import {
  ACCOUNT_ID,
  BOOKING_ID,
  CHARGE_ID,
  COACH_AMOUNT,
  COACH_PRICE,
  CRON_SECRET,
  ENROLMENT_ID,
  ENROLMENT_REF,
  ENROLMENT_UPDATED_AT,
  PAYOUT_ID,
  STRIPE_FEE,
  bookingPiRow,
  bookingRow,
  coachRow,
  enrolmentPiRow,
  enrolmentQueueRow,
  enrolmentRow,
  enrolmentScenario,
  makeChain,
  makeRequest,
  makeStripeMock,
  mockFromTables,
} from './payouts-test-harness'

type MockFn = jest.Mock

function withAdminClient(from: unknown) {
  ;(createAdminClient as MockFn).mockReturnValue({ from })
}
function withStripeMock(over: Parameters<typeof makeStripeMock>[0] = {}) {
  const stripe = makeStripeMock(over)
  ;(getStripe as MockFn).mockReturnValue(stripe)
  return stripe
}
async function call(query = '') {
  return GET(makeRequest(query) as Parameters<typeof GET>[0])
}
function tablesQueried(from: MockFn): string[] {
  return from.mock.calls.map((c) => c[0] as string)
}

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV, CRON_SECRET, PAYOUTS_ENROLMENTS_ENABLED: 'true' }
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  jest.spyOn(console, 'info').mockImplementation(() => undefined)
})
afterEach(() => jest.restoreAllMocks())
afterAll(() => {
  process.env = ORIGINAL_ENV
})

// ── Flag off: byte-identical to pre-TECH-06 ──────────────────────────────────

describe('PAYOUTS_ENROLMENTS_ENABLED off', () => {
  const EXPECTED_BOOKING_RUN = {
    checked: 1,
    transferred: 1,
    adopted: 0,
    released: 0,
    held: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
    parked: 0,
  }

  function flagOffBookingScenario() {
    const insert = makeChain()
    const update = makeChain()
    // Pre-TECH-06 table set ONLY — any enrolment table access throws.
    const from = mockFromTables({
      bookings: [makeChain({ data: [bookingRow()] })],
      payouts: [makeChain({ data: [] }), makeChain({ count: 0 }), insert, update],
      coach_profiles: [makeChain({ data: [coachRow()] })],
      payment_intents: [makeChain({ data: [bookingPiRow()] })],
    })
    withAdminClient(from)
    return { from, insert, update }
  }

  it.each([undefined, '', 'false', 'TRUE', '1'])('with the flag = %p the response and queries are unchanged', async (value) => {
    if (value === undefined) delete process.env.PAYOUTS_ENROLMENTS_ENABLED
    else process.env.PAYOUTS_ENROLMENTS_ENABLED = value
    const { from, insert } = flagOffBookingScenario()
    const stripe = withStripeMock()

    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(EXPECTED_BOOKING_RUN)

    expect(tablesQueried(from)).toEqual(['bookings', 'payouts', 'payouts', 'coach_profiles', 'payment_intents', 'payouts', 'payouts'])
    const inserted = insert.insert.mock.calls[0][0]
    expect(inserted).toEqual({
      id: expect.any(String),
      booking_id: BOOKING_ID,
      coach_profile_id: 'coach-profile-uuid-1',
      amount_pence: COACH_PRICE - STRIPE_FEE,
      currency: 'GBP',
      status: 'pending',
      scheduled_at: '2026-07-24T10:00:00.000Z',
    })
    expect(Object.keys(inserted)).not.toContain('enrolment_id')
    expect(stripe.transfers.create.mock.calls[0][0].metadata).toEqual({ booking_id: BOOKING_ID, payout_id: inserted.id })
  })

  it('dry_run with the flag off lists bookings only and reports enrolments_enabled=false', async () => {
    delete process.env.PAYOUTS_ENROLMENTS_ENABLED
    const { from, insert } = flagOffBookingScenario()
    const stripe = withStripeMock()

    const res = await call('?dry_run=1')
    const body = await res.json()
    expect(body.enrolments_enabled).toBe(false)
    expect(body.candidates).toHaveLength(1)
    expect(body.candidates[0]).toMatchObject({ kind: 'booking', id: BOOKING_ID, would: 'transfer' })
    expect(tablesQueried(from)).not.toContain('group_programme_enrolments')
    expect(insert.insert).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })
})

// ── Flag on: enrolment transfer ──────────────────────────────────────────────

describe('enrolment transfer', () => {
  it('pays coach_amount minus the ACTUAL fee, keyed on enrolment_id, no hold', async () => {
    const insert = makeChain()
    const update = makeChain()
    const { from } = enrolmentScenario({ newEnrolments: [enrolmentRow()], writeChains: [insert, update] })
    withAdminClient(from)
    const stripe = withStripeMock({ fee: 223 })

    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ checked: 1, transferred: 1, failed: 0, errors: 0, skipped: 0 })

    // Real fee off the enrolment's intent, never estimated.
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_enrol_1', {
      expand: ['latest_charge.balance_transaction'],
    })

    const inserted = insert.insert.mock.calls[0][0]
    expect(inserted).toEqual({
      id: expect.any(String),
      enrolment_id: ENROLMENT_ID,
      coach_profile_id: 'coach-profile-uuid-1',
      amount_pence: COACH_AMOUNT - 223,
      currency: 'GBP',
      status: 'pending',
      scheduled_at: ENROLMENT_UPDATED_AT, // no 48h hold — due from payment confirmation
    })
    expect(Object.keys(inserted)).not.toContain('booking_id')

    const [params, options] = stripe.transfers.create.mock.calls[0]
    expect(params).toEqual({
      amount: COACH_AMOUNT - 223,
      currency: 'gbp',
      destination: ACCOUNT_ID,
      transfer_group: ENROLMENT_REF,
      source_transaction: CHARGE_ID,
      metadata: { enrolment_id: ENROLMENT_ID, payout_id: inserted.id },
    })
    expect(options).toEqual({ idempotencyKey: inserted.id })

    expect(update.update.mock.calls[0][0]).toMatchObject({ stripe_transfer_id: 'tr_pay_1', status: 'processing', failure_reason: null })
    expect(insert.insert).toHaveBeenCalledTimes(1)
    expect(update.update).toHaveBeenCalledTimes(1)
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1)
    // The enrolment was re-read right before the transfer.
    expect(tablesQueried(from).filter((t) => t === 'group_programme_enrolments')).toHaveLength(2)
  })

  it('falls back to ENROL-<uuid> as transfer_group when the reference is null', async () => {
    const { from } = enrolmentScenario({ newEnrolments: [enrolmentRow({ enrolment_reference: null })], reread: enrolmentRow({ enrolment_reference: null }) })
    withAdminClient(from)
    const stripe = withStripeMock()

    await call()
    expect(stripe.transfers.create.mock.calls[0][0].transfer_group).toBe(`ENROL-${ENROLMENT_ID}`)
  })

  it('processes bookings and enrolments in one run, oldest money first', async () => {
    const insert = makeChain()
    const { from } = enrolmentScenario({
      newBookings: [bookingRow({ payout_eligible_at: '2026-10-17T00:00:00.000Z' })],
      newEnrolments: [enrolmentRow()], // updated_at 2026-10-16 → first
      bookingPis: [bookingPiRow()],
      writeChains: [insert],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ checked: 2, transferred: 2 })
    expect(stripe.transfers.create.mock.calls[0][0].transfer_group).toBe(ENROLMENT_REF)
    expect(stripe.transfers.create.mock.calls[1][0].transfer_group).toBe('CRK-2026-0001')
    expect(insert.insert).toHaveBeenCalledTimes(2)
    expect(insert.insert.mock.calls[0][0]).toMatchObject({ enrolment_id: ENROLMENT_ID })
    expect(insert.insert.mock.calls[0][0]).not.toHaveProperty('booking_id')
    expect(insert.insert.mock.calls[1][0]).toMatchObject({ booking_id: BOOKING_ID })
    expect(insert.insert.mock.calls[1][0]).not.toHaveProperty('enrolment_id')
  })
})

// ── Exclusions: never a row, never a transfer ────────────────────────────────

describe('enrolment exclusions', () => {
  it.each([
    ['offline enrolment', enrolmentRow({ payment_type: 'offline' }), 'offline_enrolment'],
    ['payment still pending', enrolmentRow({ payment_status: 'pending' }), 'payment_status_pending'],
    ['payment refunded', enrolmentRow({ payment_status: 'refunded' }), 'payment_status_refunded'],
    ['enrolment cancelled', enrolmentRow({ status: 'cancelled' }), 'enrolment_cancelled'],
    ['programme cancelled', enrolmentRow({}, { status: 'cancelled' }), 'programme_cancelled'],
    ['programme deleted', enrolmentRow({}, { deleted_at: '2026-10-01T00:00:00.000Z' }), 'programme_deleted'],
    ['no coach amount', enrolmentRow({ coach_amount_pence: null }), 'no_coach_amount'],
  ])('%s → skipped at discovery with no row written', async (_label, row, reason) => {
    const insert = makeChain()
    const { from } = enrolmentScenario({ newEnrolments: [row], writeChains: [insert] })
    withAdminClient(from)
    const stripe = withStripeMock()

    const res = await call()
    expect(await res.json()).toMatchObject({ checked: 0, transferred: 0, errors: 0 })
    expect(insert.insert).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining(reason))
  })

  it('an open needs_refund alert excludes the enrolment', async () => {
    const insert = makeChain()
    const { from } = enrolmentScenario({
      newEnrolments: [enrolmentRow()],
      alerts: [{ enrolment_id: ENROLMENT_ID }],
      writeChains: [insert],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ checked: 0, transferred: 0 })
    expect(insert.insert).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('open_needs_refund_alert'))
  })

  it('fails closed when the alert lookup errors: enrolments deferred, bookings still paid', async () => {
    const insert = makeChain()
    const { from } = enrolmentScenario({
      newBookings: [bookingRow()],
      newEnrolments: [enrolmentRow()],
      alertsError: { message: 'db down' },
      bookingPis: [bookingPiRow()],
      writeChains: [insert],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ checked: 1, transferred: 1 })
    expect(insert.insert.mock.calls[0][0]).toMatchObject({ booking_id: BOOKING_ID })
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('enrolments deferred'), expect.anything())
  })

  it('errors loudly and pays nothing when the enrolment has no succeeded intent', async () => {
    const insert = makeChain()
    const { from } = enrolmentScenario({ newEnrolments: [enrolmentRow()], enrolmentPis: [], writeChains: [insert] })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ errors: 1, transferred: 0 })
    expect(insert.insert).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('no succeeded'))
  })

  it('errors loudly and pays nothing when the enrolment has MORE THAN ONE succeeded intent', async () => {
    const insert = makeChain()
    const { from } = enrolmentScenario({
      newEnrolments: [enrolmentRow()],
      enrolmentPis: [enrolmentPiRow(), enrolmentPiRow({ stripe_payment_intent_id: 'pi_enrol_2' })],
      writeChains: [insert],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ errors: 1, transferred: 0 })
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(insert.insert).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('MORE THAN ONE'))
  })

  it('skips loudly with no row written when the fee is >= the coach amount', async () => {
    const insert = makeChain()
    const { from } = enrolmentScenario({ newEnrolments: [enrolmentRow({ coach_amount_pence: 100 })], writeChains: [insert] })
    withAdminClient(from)
    const stripe = withStripeMock({ fee: 113 })

    expect(await (await call()).json()).toMatchObject({ skipped: 1, transferred: 0 })
    expect(insert.insert).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('needs admin'))
  })
})

// ── Pre-transfer re-read ─────────────────────────────────────────────────────

describe('pre-transfer re-read', () => {
  it('parks the row and fires nothing when the enrolment was cancelled after selection', async () => {
    const insert = makeChain()
    const park = makeChain()
    const { from } = enrolmentScenario({
      newEnrolments: [enrolmentRow()],
      reread: enrolmentRow({ status: 'cancelled' }),
      writeChains: [insert, park],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ failed: 1, transferred: 0 })
    expect(insert.insert).toHaveBeenCalledTimes(1) // write-intent-first row exists…
    expect(park.update.mock.calls[0][0]).toEqual({
      status: 'failed',
      failure_reason: 'enrolment_not_payable: enrolment_cancelled',
      retry_count: 5,
    })
    expect(stripe.transfers.list).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled() // …but no money moved
  })

  it('parks when the programme was cancelled after selection', async () => {
    const park = makeChain()
    const { from } = enrolmentScenario({
      newEnrolments: [enrolmentRow()],
      reread: enrolmentRow({}, { status: 'cancelled' }),
      writeChains: [makeChain(), park],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    await call()
    expect(park.update.mock.calls[0][0]).toMatchObject({ failure_reason: 'enrolment_not_payable: programme_cancelled' })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('parks when the enrolment row vanished', async () => {
    const park = makeChain()
    const { from } = enrolmentScenario({ newEnrolments: [enrolmentRow()], reread: null, writeChains: [makeChain(), park] })
    withAdminClient(from)
    const stripe = withStripeMock()

    await call()
    expect(park.update.mock.calls[0][0]).toMatchObject({ failure_reason: 'enrolment_not_payable: enrolment_missing' })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('does not fire blind when the re-read itself fails', async () => {
    const { from } = enrolmentScenario({ newEnrolments: [enrolmentRow()], rereadError: { message: 'db down' } })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ errors: 1, transferred: 0 })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })
})

// ── Held contract, ghost guard, belt-and-braces ──────────────────────────────

describe('enrolment rows reuse the booking machinery', () => {
  it('holds with no_stripe_account, writing the real net amount on enrolment_id', async () => {
    const insert = makeChain()
    const { from } = enrolmentScenario({
      newEnrolments: [enrolmentRow()],
      coaches: [coachRow({ stripe_account_id: null })],
      writeChains: [insert],
    })
    withAdminClient(from)
    const stripe = withStripeMock({ fee: 223 })

    expect(await (await call()).json()).toMatchObject({ held: 1, transferred: 0 })
    expect(insert.insert.mock.calls[0][0]).toEqual({
      id: expect.any(String),
      enrolment_id: ENROLMENT_ID,
      coach_profile_id: 'coach-profile-uuid-1',
      amount_pence: COACH_AMOUNT - 223,
      currency: 'GBP',
      status: 'held',
      held_reason: 'no_stripe_account',
      scheduled_at: ENROLMENT_UPDATED_AT,
    })
    expect(insert.insert).toHaveBeenCalledTimes(1)
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('releases a held enrolment row and transfers in the same run once Stripe is ready', async () => {
    const release = makeChain()
    const { from } = enrolmentScenario({
      enrolmentQueue: [enrolmentQueueRow({ status: 'held', held_reason: 'no_stripe_account' })],
      writeChains: [release],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ released: 1, transferred: 1 })
    expect(release.update.mock.calls[0][0]).toEqual({ status: 'pending', held_reason: null })
    expect(release.update).toHaveBeenCalledTimes(2) // release, then the success update
    expect(stripe.transfers.create.mock.calls[0][1]).toEqual({ idempotencyKey: PAYOUT_ID })
  })

  it('adopts an existing transfer for a crashed pending enrolment row (ghost guard by enrolment reference)', async () => {
    const adopt = makeChain()
    const { from } = enrolmentScenario({ enrolmentQueue: [enrolmentQueueRow()], writeChains: [adopt] })
    withAdminClient(from)
    const stripe = withStripeMock({ listData: [{ id: 'tr_ghost_e1' }] })

    expect(await (await call()).json()).toMatchObject({ adopted: 1, transferred: 0 })
    expect(stripe.transfers.list).toHaveBeenCalledWith({ transfer_group: ENROLMENT_REF, destination: ACCOUNT_ID, limit: 10 })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(adopt.update.mock.calls[0][0]).toMatchObject({ stripe_transfer_id: 'tr_ghost_e1', status: 'processing' })
    expect(adopt.update).toHaveBeenCalledTimes(1)
  })

  it('never fires for an enrolment payout already processing', async () => {
    const { from } = enrolmentScenario({ enrolmentQueue: [enrolmentQueueRow({ status: 'processing', stripe_transfer_id: 'tr_done' })] })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ skipped: 1, transferred: 0 })
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('parks a queued enrolment row whose enrolment is no longer payable', async () => {
    const park = makeChain()
    const { from } = enrolmentScenario({
      enrolmentQueue: [enrolmentQueueRow({}, { payment_status: 'refunded' })],
      reread: enrolmentRow({ payment_status: 'refunded' }),
      writeChains: [park],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ failed: 1, transferred: 0 })
    expect(park.update.mock.calls[0][0]).toMatchObject({ status: 'failed', failure_reason: 'enrolment_not_payable: payment_status_refunded', retry_count: 5 })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('skips when a concurrent run already inserted the enrolment row (23505)', async () => {
    const insert = makeChain({ error: { code: '23505', message: 'duplicate key' } })
    const { from } = enrolmentScenario({ newEnrolments: [enrolmentRow()], writeChains: [insert] })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ skipped: 1, transferred: 0, errors: 0 })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('returns 500 when an enrolment selection query fails', async () => {
    const from = mockFromTables({
      bookings: [makeChain({ data: [] })],
      payouts: [makeChain({ data: [] }), makeChain({ count: 0 }), makeChain({ data: [] })],
      group_programme_enrolments: [makeChain({ error: { message: 'db down' } })],
    })
    withAdminClient(from)
    withStripeMock()

    const res = await call()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error' })
  })
})

// ── Dry-run ──────────────────────────────────────────────────────────────────

describe('dry-run', () => {
  function dryRunScenario() {
    const insert = makeChain()
    const update = makeChain()
    const { from } = enrolmentScenario({
      newBookings: [bookingRow()],
      newEnrolments: [enrolmentRow(), enrolmentRow({ id: 'enrolment-cancelled', status: 'cancelled' })],
      enrolmentQueue: [enrolmentQueueRow({ id: 'payout-queued', enrolment_id: 'enrolment-queued' }, { id: 'enrolment-queued' })],
      bookingPis: [bookingPiRow()],
      enrolmentPis: [enrolmentPiRow(), enrolmentPiRow({ enrolment_id: 'enrolment-queued', stripe_payment_intent_id: 'pi_enrol_q' })],
      writeChains: [insert, update],
    })
    withAdminClient(from)
    return { from, insert, update }
  }

  it('?dry_run=1 lists candidates with ESTIMATED fees and touches nothing', async () => {
    const { insert, update } = dryRunScenario()
    const stripe = withStripeMock()

    const res = await call('?dry_run=1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ dry_run: '1', enrolments_enabled: true, fee_source: 'estimated', parked: 0 })
    expect(body.candidates).toHaveLength(3)

    const enrol = body.candidates.find((c: { id: string }) => c.id === ENROLMENT_ID)
    // 1.5% of the £135.00 charged + 20p = 223p (estimate on what the parent paid)
    expect(enrol).toMatchObject({
      kind: 'enrolment',
      reference: ENROLMENT_REF,
      stripe_account_connected: true,
      gross_pence: COACH_AMOUNT,
      fee_pence: 223,
      fee_source: 'estimated',
      net_pence: COACH_AMOUNT - 223,
      existing_payout: null,
      would: 'transfer',
      reason: null,
    })
    const queued = body.candidates.find((c: { id: string }) => c.id === 'enrolment-queued')
    expect(queued).toMatchObject({ would: 'adopt_or_transfer', existing_payout: { id: 'payout-queued', status: 'pending' } })
    const booking = body.candidates.find((c: { id: string }) => c.id === BOOKING_ID)
    expect(booking).toMatchObject({ kind: 'booking', fee_pence: 110, net_pence: COACH_PRICE - 110, would: 'transfer' })
    expect(body.excluded_enrolments).toEqual([
      { id: 'enrolment-cancelled', reference: ENROLMENT_REF, reason: 'enrolment_cancelled' },
    ])

    // Nothing moved, nothing written, nothing asked of Stripe.
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(stripe.transfers.list).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(insert.insert).not.toHaveBeenCalled()
    expect(update.update).not.toHaveBeenCalled()
  })

  it('?dry_run=stripe reads the ACTUAL fee per candidate and still touches nothing', async () => {
    const { insert, update } = dryRunScenario()
    const stripe = withStripeMock({ fee: 199 })

    const body = await (await call('?dry_run=stripe')).json()
    expect(body).toMatchObject({ dry_run: 'stripe', fee_source: 'stripe' })
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledTimes(3)
    for (const c of body.candidates) {
      expect(c).toMatchObject({ fee_pence: 199, fee_source: 'stripe' })
    }
    expect(stripe.transfers.list).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(insert.insert).not.toHaveBeenCalled()
    expect(update.update).not.toHaveBeenCalled()
  })

  it('reports a hold instead of a transfer for an unconnected coach', async () => {
    const { from } = enrolmentScenario({ newEnrolments: [enrolmentRow()], coaches: [coachRow({ stripe_account_id: null })] })
    withAdminClient(from)
    withStripeMock()

    const body = await (await call('?dry_run=1')).json()
    expect(body.candidates[0]).toMatchObject({ would: 'hold', reason: 'no_stripe_account', stripe_account_connected: false })
  })

  it('rejects an unknown dry_run value with 400 before touching anything', async () => {
    const from = jest.fn()
    withAdminClient(from)
    const stripe = withStripeMock()

    const res = await call('?dry_run=yes')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_dry_run', allowed: ['1', 'stripe'] })
    expect(from).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('still requires the CRON_SECRET', async () => {
    withAdminClient(jest.fn())
    withStripeMock()
    const res = await GET(makeRequest('?dry_run=1', 'Bearer wrong') as Parameters<typeof GET>[0])
    expect(res.status).toBe(401)
  })
})

// ── Gaps closed from the crikly-test-engineer review ─────────────────────────

describe('enrolment held / failure / dedup parity with bookings', () => {
  it('updates only held_reason when an ongoing hold changes reason', async () => {
    const write = makeChain()
    const { from } = enrolmentScenario({
      enrolmentQueue: [enrolmentQueueRow({ status: 'held', held_reason: 'no_stripe_account' })],
      coaches: [coachRow({ stripe_onboarding_complete: false })],
      writeChains: [write],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ held: 1, transferred: 0 })
    expect(write.update).toHaveBeenCalledTimes(1)
    expect(write.update.mock.calls[0][0]).toEqual({ held_reason: 'stripe_onboarding_incomplete' })
    expect(write.eq).toHaveBeenCalledWith('status', 'held')
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('re-evaluates an unchanged hold with zero writes and zero Stripe calls', async () => {
    const write = makeChain()
    const { from } = enrolmentScenario({
      enrolmentQueue: [enrolmentQueueRow({ status: 'held', held_reason: 'no_stripe_account' })],
      coaches: [coachRow({ stripe_account_id: null })],
      writeChains: [write],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ held: 1 })
    expect(write.update).not.toHaveBeenCalled()
    expect(write.insert).not.toHaveBeenCalled()
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
  })

  it('re-holds a pending enrolment row whose coach lost Stripe readiness', async () => {
    const write = makeChain()
    const { from } = enrolmentScenario({
      enrolmentQueue: [enrolmentQueueRow({ status: 'pending' })],
      coaches: [coachRow({ stripe_account_id: null })],
      writeChains: [write],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ held: 1, transferred: 0 })
    expect(write.update).toHaveBeenCalledTimes(1)
    expect(write.update.mock.calls[0][0]).toEqual({ status: 'held', held_reason: 'no_stripe_account', failure_reason: null })
    expect(write.eq).toHaveBeenCalledWith('status', 'pending')
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('does not fire blind when transfers.list fails for an enrolment row', async () => {
    const write = makeChain()
    const { from } = enrolmentScenario({ enrolmentQueue: [enrolmentQueueRow()], writeChains: [write] })
    withAdminClient(from)
    const stripe = withStripeMock({ listRejects: true })

    expect(await (await call()).json()).toMatchObject({ errors: 1, transferred: 0, adopted: 0 })
    expect(stripe.transfers.create).not.toHaveBeenCalled()
    expect(write.update).not.toHaveBeenCalled()
    expect(write.insert).not.toHaveBeenCalled()
  })

  it('counts an error, not a transfer, when the success update fails after the transfer fired', async () => {
    const insert = makeChain()
    const brokenUpdate = makeChain({ error: { message: 'db down' } })
    const { from } = enrolmentScenario({ newEnrolments: [enrolmentRow()], writeChains: [insert, brokenUpdate] })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ transferred: 0, errors: 1 })
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1) // money DID move…
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ghost guard will adopt'), expect.anything())
  })

  it('retries a failed enrolment row reusing the SAME row UUID as the idempotency key', async () => {
    const write = makeChain()
    const { from } = enrolmentScenario({
      enrolmentQueue: [enrolmentQueueRow({ status: 'failed', retry_count: 2, stripe_transfer_id: null })],
      writeChains: [write],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ transferred: 1, failed: 0 })
    expect(stripe.transfers.create.mock.calls[0][1]).toEqual({ idempotencyKey: PAYOUT_ID })
    expect(write.update.mock.calls[0][0]).toMatchObject({ status: 'processing', failure_reason: null })
  })

  it('increments retry_count from the existing enrolment row on a repeat failure', async () => {
    const write = makeChain()
    const { from } = enrolmentScenario({
      enrolmentQueue: [enrolmentQueueRow({ status: 'failed', retry_count: 3 })],
      writeChains: [write],
    })
    withAdminClient(from)
    withStripeMock({ createRejects: true })

    expect(await (await call()).json()).toMatchObject({ failed: 1 })
    const failedWrite = write.update.mock.calls.find((c) => c[0].status === 'failed')
    expect(failedWrite?.[0]).toMatchObject({ retry_count: 4, failure_reason: 'Insufficient funds in Stripe balance' })
  })

  it('deduplicates an enrolment that appears in both C and B2 (queue row wins, one transfer)', async () => {
    const write = makeChain()
    const { from } = enrolmentScenario({
      newEnrolments: [enrolmentRow()],
      enrolmentQueue: [enrolmentQueueRow({ status: 'pending' })],
      writeChains: [write],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    expect(await (await call()).json()).toMatchObject({ checked: 1, transferred: 1 })
    expect(write.insert).not.toHaveBeenCalled()
    expect(stripe.transfers.list).toHaveBeenCalledTimes(1)
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1)
    expect(stripe.transfers.create.mock.calls[0][1]).toEqual({ idempotencyKey: PAYOUT_ID })
  })
})

describe('dry-run edge cases', () => {
  it('reports multiple succeeded intents as an error and never reads Stripe for that row', async () => {
    const { from } = enrolmentScenario({
      newEnrolments: [enrolmentRow(), enrolmentRow({ id: 'enrolment-dup' })],
      enrolmentPis: [
        enrolmentPiRow(),
        enrolmentPiRow({ enrolment_id: 'enrolment-dup', stripe_payment_intent_id: 'pi_dup_a' }),
        enrolmentPiRow({ enrolment_id: 'enrolment-dup', stripe_payment_intent_id: 'pi_dup_b' }),
      ],
    })
    withAdminClient(from)
    const stripe = withStripeMock({ fee: 150 })

    const body = await (await call('?dry_run=stripe')).json()
    const dup = body.candidates.find((c: { id: string }) => c.id === 'enrolment-dup')
    expect(dup).toMatchObject({ would: 'error', reason: 'multiple_succeeded_intents', fee_pence: null, net_pence: null })
    // Only the clean enrolment's intent was read.
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledTimes(1)
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_enrol_1', expect.anything())
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('an enrolment in both C and B2 is listed once from its queue state, never as excluded', async () => {
    const { from } = enrolmentScenario({
      // Discovery shape looks cancelled, but the queue row is live and wins.
      newEnrolments: [enrolmentRow({ status: 'cancelled' })],
      enrolmentQueue: [enrolmentQueueRow({ status: 'pending' })],
    })
    withAdminClient(from)
    const stripe = withStripeMock()

    const body = await (await call('?dry_run=1')).json()
    expect(body.candidates.filter((c: { id: string }) => c.id === ENROLMENT_ID)).toHaveLength(1)
    expect(body.candidates[0]).toMatchObject({ would: 'adopt_or_transfer', existing_payout: { id: PAYOUT_ID, status: 'pending' } })
    expect(body.excluded_enrolments).toEqual([])
    expect(stripe.transfers.list).not.toHaveBeenCalled()
    expect(stripe.transfers.create).not.toHaveBeenCalled()
  })

  it('a fee the dry-run cannot resolve in stripe mode is reported as an error, not estimated', async () => {
    const { from } = enrolmentScenario({ newEnrolments: [enrolmentRow()] })
    withAdminClient(from)
    withStripeMock({ latestCharge: { id: CHARGE_ID, balance_transaction: 'txn_unexpanded' } })

    const body = await (await call('?dry_run=stripe')).json()
    expect(body.candidates[0]).toMatchObject({ would: 'error', reason: 'fee_unresolvable', fee_pence: null })
  })
})
