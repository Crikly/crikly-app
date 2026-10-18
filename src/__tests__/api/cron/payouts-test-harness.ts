// Shared mock harness for the C-PAY-02 payout cron tests (TECH-06).
//
// Not a test file itself (no .test. suffix, so Jest's testMatch skips it).
// Mirrors the builders inside process-coach-payouts.test.ts; that file is
// deliberately left untouched so it stands as the proof that booking payouts
// are byte-identical before and after TECH-06.

type MockFn = jest.Mock

export function makeChain(result: { data?: unknown; error?: unknown; count?: number } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null, count: result.count ?? null }
  const chain: Record<string, MockFn> & { then?: unknown } = {}
  for (const m of [
    'select',
    'eq',
    'neq',
    'is',
    'not',
    'in',
    'lte',
    'gte',
    'or',
    'order',
    'limit',
    'insert',
    'update',
    'maybeSingle',
  ]) {
    chain[m] = jest.fn(() => chain)
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(resolved)
  return chain
}

export type Chain = ReturnType<typeof makeChain>

/**
 * Table-keyed from() dispatcher. Each table gets a queue of chains consumed
 * in call order; the last chain is sticky so repeated calls reuse it. An
 * unexpected table throws, failing the test loudly — which is exactly how the
 * flag-off tests prove the enrolment tables are never touched.
 */
export function mockFromTables(map: Record<string, Chain[]>) {
  const queues = new Map(Object.entries(map).map(([k, v]) => [k, [...v]]))
  return jest.fn((table: string) => {
    const q = queues.get(table)
    if (!q || q.length === 0) throw new Error(`unexpected from('${table}')`)
    return q.length > 1 ? q.shift() : q[0]
  })
}

export const CHARGE_ID = 'ch_pay_1'
export const STRIPE_FEE = 113

/** A Stripe-shaped error (the route duck-types code/type/statusCode). */
export function stripeError(over: { code?: string; type?: string; statusCode?: number; message?: string } = {}) {
  const e = new Error(over.message ?? 'stripe error') as Error & { code?: string; type?: string; statusCode?: number }
  if (over.code !== undefined) e.code = over.code
  if (over.type !== undefined) e.type = over.type
  if (over.statusCode !== undefined) e.statusCode = over.statusCode
  return e
}

export const BALANCE_INSUFFICIENT = () =>
  stripeError({
    code: 'balance_insufficient',
    type: 'StripeInvalidRequestError',
    statusCode: 400,
    message: 'You have insufficient available funds in your Stripe account.',
  })

/** list() results are filtered by the route on source_transaction / payout_id. */
export function listedTransfer(over: Record<string, unknown> = {}) {
  return { id: 'tr_ghost_1', source_transaction: CHARGE_ID, metadata: {}, ...over }
}

export function makeStripeMock(
  over: {
    fee?: number
    /** balance_transaction.status — 'pending' (default) or 'available' */
    btStatus?: 'pending' | 'available'
    btAvailableOn?: number
    latestCharge?: unknown
    retrieveRejects?: boolean
    createRejects?: boolean
    /** Error thrown by every transfers.create; overrides createRejects */
    createError?: Error
    listData?: Array<{ id: string; source_transaction?: string; metadata?: Record<string, string> }>
    listRejects?: boolean
    transferRetrieveRejects?: boolean
    availablePence?: number
    balanceRejects?: boolean
  } = {},
) {
  const createError = over.createError ?? (over.createRejects ? new Error('Insufficient funds in Stripe balance') : null)
  return {
    paymentIntents: {
      retrieve: over.retrieveRejects
        ? jest.fn().mockRejectedValue(new Error('No such payment_intent'))
        : jest.fn().mockResolvedValue({
            id: 'pi_pay_1',
            latest_charge:
              'latestCharge' in over
                ? over.latestCharge
                : {
                    id: CHARGE_ID,
                    balance_transaction: {
                      id: 'txn_pay_1',
                      fee: over.fee ?? STRIPE_FEE,
                      status: over.btStatus ?? 'pending',
                      available_on: over.btAvailableOn ?? 1792627200, // 2026-10-22T00:00:00Z
                    },
                  },
          }),
    },
    balance: {
      retrieve: over.balanceRejects
        ? jest.fn().mockRejectedValue(new Error('balance unavailable'))
        : jest.fn().mockResolvedValue({
            available: [{ amount: over.availablePence ?? 0, currency: 'gbp', source_types: { card: over.availablePence ?? 0 } }],
            pending: [{ amount: 0, currency: 'gbp', source_types: { card: 0 } }],
          }),
    },
    transfers: {
      list: over.listRejects
        ? jest.fn().mockRejectedValue(new Error('rate limited'))
        : jest.fn().mockResolvedValue({ data: over.listData ?? [] }),
      retrieve: over.transferRetrieveRejects
        ? jest.fn().mockRejectedValue(new Error('No such transfer'))
        : jest.fn().mockImplementation(async (id: string) => ({ id })),
      create: createError
        ? jest.fn().mockRejectedValue(createError)
        : jest.fn().mockResolvedValue({ id: 'tr_pay_1' }),
    },
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

export const BOOKING_ID = 'booking-pay-uuid-1'
export const ENROLMENT_ID = 'enrolment-pay-uuid-1'
export const COACH_ID = 'coach-profile-uuid-1'
export const PAYOUT_ID = 'payout-row-uuid-1'
export const ACCOUNT_ID = 'acct_coach_1'
export const COACH_PRICE = 6000 // £60.00 booking
export const COACH_AMOUNT = 13500 // £135.00 enrolment (block)
export const PARENT_TOTAL = 13500 // pilot: 0% commission
export const ENROLMENT_REF = 'CRK-2026-E00001'
export const ENROLMENT_UPDATED_AT = '2026-10-16T09:30:00.000Z'

export function bookingRow(over: Record<string, unknown> = {}) {
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

export function programmeEmbed(over: Record<string, unknown> = {}) {
  return { coach_profile_id: COACH_ID, status: 'active', deleted_at: null, ...over }
}

/** A query-C discovery row / pre-transfer re-read row. */
export function enrolmentRow(over: Record<string, unknown> = {}, programmeOver: Record<string, unknown> = {}) {
  return {
    id: ENROLMENT_ID,
    enrolment_reference: ENROLMENT_REF,
    coach_amount_pence: COACH_AMOUNT,
    parent_total_pence: PARENT_TOTAL,
    currency: 'GBP',
    updated_at: ENROLMENT_UPDATED_AT,
    payment_status: 'succeeded',
    status: 'active',
    payment_type: 'platform',
    group_programmes: programmeEmbed(programmeOver),
    ...over,
  }
}

export function coachRow(over: Record<string, unknown> = {}) {
  return { id: COACH_ID, stripe_account_id: ACCOUNT_ID, stripe_onboarding_complete: true, ...over }
}

/** A query-B2 work-queue row: an enrolment payout row with its enrolment embedded. */
export function enrolmentQueueRow(
  payoutOver: Record<string, unknown> = {},
  enrolmentOver: Record<string, unknown> = {},
) {
  return {
    id: PAYOUT_ID,
    booking_id: null,
    enrolment_id: ENROLMENT_ID,
    status: 'pending',
    retry_count: 0,
    stripe_transfer_id: null,
    held_reason: null,
    ...payoutOver,
    group_programme_enrolments: enrolmentRow(enrolmentOver),
  }
}

export function bookingPiRow(over: Record<string, unknown> = {}) {
  return { booking_id: BOOKING_ID, stripe_payment_intent_id: 'pi_pay_1', ...over }
}

export function enrolmentPiRow(over: Record<string, unknown> = {}) {
  return { enrolment_id: ENROLMENT_ID, stripe_payment_intent_id: 'pi_enrol_1', ...over }
}

/**
 * Flag-ON scenario. from() call order in the route:
 *   bookings                   → query A
 *   payouts                    → query B, parked count, query B2, then writes (sticky)
 *   group_programme_enrolments → query C, then the pre-transfer re-read(s) (sticky)
 *   payment_alerts             → open needs_refund lookup
 *   coach_profiles             → batch select
 *   payment_intents            → booking intents, then enrolment intents (sticky)
 */
export function enrolmentScenario(opts: {
  newBookings?: unknown[]
  bookingQueue?: unknown[]
  parkedCount?: number
  newEnrolments?: unknown[]
  enrolmentQueue?: unknown[]
  alerts?: unknown[]
  alertsError?: unknown
  reread?: unknown | null
  rereadError?: unknown
  coaches?: unknown[]
  bookingPis?: unknown[]
  enrolmentPis?: unknown[]
  writeChains?: Chain[]
} = {}) {
  const writes = opts.writeChains ?? [makeChain()]
  const reread = makeChain(
    opts.rereadError
      ? { error: opts.rereadError }
      : { data: 'reread' in opts ? opts.reread : enrolmentRow() },
  )
  const from = mockFromTables({
    bookings: [makeChain({ data: opts.newBookings ?? [] })],
    payouts: [
      makeChain({ data: opts.bookingQueue ?? [] }),
      makeChain({ count: opts.parkedCount ?? 0 }),
      makeChain({ data: opts.enrolmentQueue ?? [] }),
      ...writes,
    ],
    group_programme_enrolments: [makeChain({ data: opts.newEnrolments ?? [] }), reread],
    payment_alerts: [makeChain(opts.alertsError ? { error: opts.alertsError } : { data: opts.alerts ?? [] })],
    coach_profiles: [makeChain({ data: opts.coaches ?? [coachRow()] })],
    payment_intents: [
      makeChain({ data: opts.bookingPis ?? [] }),
      makeChain({ data: opts.enrolmentPis ?? [enrolmentPiRow()] }),
    ],
  })
  return { from, writes, reread }
}

export const CRON_SECRET = 'test-cron-secret'

export function makeRequest(query = '', auth: string | null = `Bearer ${CRON_SECRET}`) {
  const headers: Record<string, string> = {}
  if (auth !== null) headers.authorization = auth
  return new Request(`http://localhost/api/cron/process-coach-payouts${query}`, { method: 'GET', headers })
}
