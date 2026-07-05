// Integration tests for GET /api/cron/release-expired-bookings (BUG-13b)
//
// All external dependencies mocked:
//   - @/lib/supabase/admin → createAdminClient
//   - @/lib/stripe/client  → getStripe
//
// The reaper's contract under test:
//   - CRON_SECRET Bearer auth (401 without it, 500 when unconfigured).
//   - Cancel-first arbitration: a booking is released ONLY after the Stripe
//     cancel succeeds; succeeded intents are NEVER released; refused cancels
//     skip the row (the resurrection race, BUG-13b Step 0).
//   - Activity grace: recent payment_intents.updated_at (an actively retrying
//     payer) skips the row.
//   - Slow-3DS protection: processing/requires_action intents are skipped
//     inside the hard cap, cancelled past it.
//   - Release semantics: soft delete + cancellation_reason
//     'expired_pending_payment', provisional profile soft-deleted alongside.

// ── Module mocks (must appear before any imports) ─────────────────────────────

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import { GET } from '@/app/api/cron/release-expired-bookings/route'

// ── Types ─────────────────────────────────────────────────────────────────────

type MockFn = jest.Mock

// ── Supabase chain builder ────────────────────────────────────────────────────
//
// Every reaper query awaits the builder directly (no .single()/.maybeSingle()),
// so the chain is thenable and resolves to { data, error } wherever the await
// lands (mirrors makeListChain in the guest-bookings tests).

function makeThenableChain(result: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  const chain: Record<string, MockFn> & { then?: unknown } = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'lt', 'order', 'limit', 'update', 'not']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(resolved)
  return chain
}

/**
 * Table-keyed from() dispatcher. Each table gets a queue of chains consumed in
 * call order; the last chain is sticky so repeated reads reuse it. An
 * unexpected table throws, failing the test loudly.
 */
function mockFromTables(map: Record<string, Array<ReturnType<typeof makeThenableChain>>>) {
  const queues = new Map(Object.entries(map).map(([k, v]) => [k, [...v]]))
  return jest.fn((table: string) => {
    const q = queues.get(table)
    if (!q || q.length === 0) throw new Error(`unexpected from('${table}')`)
    return q.length > 1 ? q.shift() : q[0]
  })
}

// ── Stripe mock builder ───────────────────────────────────────────────────────

function makeStripeMock(overrides: {
  retrieveStatus?: string
  cancelRejects?: boolean
} = {}) {
  return {
    paymentIntents: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi_reap_1',
        status: overrides.retrieveStatus ?? 'requires_payment_method',
      }),
      cancel: overrides.cancelRejects
        ? jest.fn().mockRejectedValue(new Error('This PaymentIntent cannot be canceled'))
        : jest.fn().mockResolvedValue({ id: 'pi_reap_1', status: 'canceled' }),
    },
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString()
}

const BOOKING_ID = 'booking-reap-uuid-1'
const PROFILE_ID = 'prov-profile-uuid-1'

function candidateRow(createdMinutesAgo = 45) {
  return {
    id: BOOKING_ID,
    created_at: minutesAgo(createdMinutesAgo),
    booked_by_user_id: PROFILE_ID,
  }
}

function piRow(over: Record<string, unknown> = {}) {
  return {
    booking_id: BOOKING_ID,
    stripe_payment_intent_id: 'pi_reap_1',
    status: 'pending',
    updated_at: minutesAgo(40),
    ...over,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CRON_SECRET = 'test-cron-secret'

function makeCronRequest(auth: string | null = `Bearer ${CRON_SECRET}`) {
  const headers: Record<string, string> = {}
  if (auth !== null) headers.authorization = auth
  return new Request('http://localhost/api/cron/release-expired-bookings', {
    method: 'GET',
    headers,
  })
}

async function callGet(auth?: string | null) {
  return GET(makeCronRequest(auth) as Parameters<typeof GET>[0])
}

// BUG-19 Phase 2: every authorised run ends with
// rpc('reconcile_coach_time_claims') — the claims drift sweep. Default mock:
// clean sweep (0 released). Tests pass their own rpc mock to exercise the
// drift / failure paths.
function adminClient(from: unknown, rpc?: MockFn) {
  return { from, rpc: rpc ?? jest.fn().mockResolvedValue({ data: 0, error: null }) }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-placeholder'
process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = CRON_SECRET
  ;(createAdminClient as MockFn).mockReturnValue(adminClient(jest.fn()))
  ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
})

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /api/cron/release-expired-bookings — auth', () => {
  it('returns 401 without the Authorization header and touches no data', async () => {
    const mockFrom = jest.fn()
    ;(createAdminClient as MockFn).mockReturnValue(adminClient(mockFrom))

    const res = await callGet(null)
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns 401 on a wrong bearer token', async () => {
    const res = await callGet('Bearer wrong-secret')
    expect(res.status).toBe(401)
  })

  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const res = await callGet()
    expect(res.status).toBe(500)
  })
})

// ── Reaping ───────────────────────────────────────────────────────────────────

describe('GET /api/cron/release-expired-bookings — reaping', () => {
  it('returns zero counts when there are no candidates', async () => {
    const candidatesChain = makeThenableChain({ data: [] })
    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({ bookings: [candidatesChain] })),
    )

    const res = await callGet()
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data.checked).toBe(0)
    expect(data.released).toBe(0)
  })

  it('releases an idle expired booking: cancel first, then soft delete + reason + profile', async () => {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const candidatesChain = makeThenableChain({ data: [candidateRow()] })
    const releaseChain = makeThenableChain({ data: [{ id: BOOKING_ID }] })
    const piLookupChain = makeThenableChain({ data: [piRow()] })
    const piUpdateChain = makeThenableChain({ data: null })
    const profileChain = makeThenableChain({ data: null })

    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({
        bookings: [candidatesChain, releaseChain],
        payment_intents: [piLookupChain, piUpdateChain],
        user_profiles: [profileChain],
      })),
    )

    const res = await callGet()
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data.released).toBe(1)

    // Cancel-first: the Stripe cancel happened, marked as abandoned.
    expect(stripeMock.paymentIntents.cancel).toHaveBeenCalledWith('pi_reap_1', {
      cancellation_reason: 'abandoned',
    })

    // Audit row converged to terminal.
    const piUpdateArg = (piUpdateChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(piUpdateArg.status).toBe('failed')
    expect(piUpdateArg.stripe_status).toBe('canceled')

    // Release = soft delete + reason; status untouched.
    const releaseArg = (releaseChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(releaseArg.deleted_at).toBeTruthy()
    expect(releaseArg.cancelled_at).toBeTruthy()
    expect(releaseArg.cancellation_reason).toBe('expired_pending_payment')
    expect(releaseArg.status).toBeUndefined()

    // Provisional profile soft-deleted alongside.
    const profileArg = (profileChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(profileArg.deleted_at).toBeTruthy()
  })

  it('skips a row with recent payment activity (active retry grace)', async () => {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const candidatesChain = makeThenableChain({ data: [candidateRow()] })
    const releaseChain = makeThenableChain({ data: [] })
    const piLookupChain = makeThenableChain({ data: [piRow({ updated_at: minutesAgo(5) })] })

    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({
        bookings: [candidatesChain, releaseChain],
        payment_intents: [piLookupChain],
      })),
    )

    const res = await callGet()
    const data = await res.json() as Record<string, unknown>
    expect(data.skipped_active).toBe(1)
    expect(data.released).toBe(0)
    expect(stripeMock.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(releaseChain.update).not.toHaveBeenCalled()
  })

  it('NEVER releases a booking whose audit row says succeeded', async () => {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const candidatesChain = makeThenableChain({ data: [candidateRow()] })
    const releaseChain = makeThenableChain({ data: [] })
    const piLookupChain = makeThenableChain({ data: [piRow({ status: 'succeeded' })] })

    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({
        bookings: [candidatesChain, releaseChain],
        payment_intents: [piLookupChain],
      })),
    )

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const res = await callGet()
      const data = await res.json() as Record<string, unknown>
      expect(data.released).toBe(0)
      expect(data.errors).toBe(1)
      expect(stripeMock.paymentIntents.cancel).not.toHaveBeenCalled()
      expect(releaseChain.update).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('NEVER releases when Stripe says the intent succeeded (audit row lagging)', async () => {
    const stripeMock = makeStripeMock({ retrieveStatus: 'succeeded' })
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const candidatesChain = makeThenableChain({ data: [candidateRow()] })
    const releaseChain = makeThenableChain({ data: [] })
    const piLookupChain = makeThenableChain({ data: [piRow()] })

    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({
        bookings: [candidatesChain, releaseChain],
        payment_intents: [piLookupChain],
      })),
    )

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const res = await callGet()
      const data = await res.json() as Record<string, unknown>
      expect(data.released).toBe(0)
      expect(stripeMock.paymentIntents.cancel).not.toHaveBeenCalled()
      expect(releaseChain.update).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('skips an in-flight 3DS intent (requires_action) inside the hard cap', async () => {
    const stripeMock = makeStripeMock({ retrieveStatus: 'requires_action' })
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const candidatesChain = makeThenableChain({ data: [candidateRow(45)] }) // < 2h hard cap
    const releaseChain = makeThenableChain({ data: [] })
    const piLookupChain = makeThenableChain({ data: [piRow()] })

    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({
        bookings: [candidatesChain, releaseChain],
        payment_intents: [piLookupChain],
      })),
    )

    const res = await callGet()
    const data = await res.json() as Record<string, unknown>
    expect(data.skipped_stripe).toBe(1)
    expect(data.released).toBe(0)
    expect(stripeMock.paymentIntents.cancel).not.toHaveBeenCalled()
  })

  it('cancels a requires_action intent once past the hard cap (abandoned mid-3DS)', async () => {
    const stripeMock = makeStripeMock({ retrieveStatus: 'requires_action' })
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const candidatesChain = makeThenableChain({ data: [candidateRow(180)] }) // > 2h hard cap
    const releaseChain = makeThenableChain({ data: [{ id: BOOKING_ID }] })
    const piLookupChain = makeThenableChain({ data: [piRow({ updated_at: minutesAgo(170) })] })
    const piUpdateChain = makeThenableChain({ data: null })
    const profileChain = makeThenableChain({ data: null })

    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({
        bookings: [candidatesChain, releaseChain],
        payment_intents: [piLookupChain, piUpdateChain],
        user_profiles: [profileChain],
      })),
    )

    const res = await callGet()
    const data = await res.json() as Record<string, unknown>
    expect(stripeMock.paymentIntents.cancel).toHaveBeenCalled()
    expect(data.released).toBe(1)
  })

  it('does NOT release when the Stripe cancel is refused (raced to success)', async () => {
    const stripeMock = makeStripeMock({ cancelRejects: true })
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const candidatesChain = makeThenableChain({ data: [candidateRow()] })
    const releaseChain = makeThenableChain({ data: [] })
    const piLookupChain = makeThenableChain({ data: [piRow()] })

    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({
        bookings: [candidatesChain, releaseChain],
        payment_intents: [piLookupChain],
      })),
    )

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const res = await callGet()
      const data = await res.json() as Record<string, unknown>
      expect(data.released).toBe(0)
      expect(data.skipped_stripe).toBe(1)
      expect(releaseChain.update).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('releases directly when no payment_intents row exists (creation crashed mid-flight)', async () => {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const candidatesChain = makeThenableChain({ data: [candidateRow()] })
    const releaseChain = makeThenableChain({ data: [{ id: BOOKING_ID }] })
    const piLookupChain = makeThenableChain({ data: [] })
    const profileChain = makeThenableChain({ data: null })

    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({
        bookings: [candidatesChain, releaseChain],
        payment_intents: [piLookupChain],
        user_profiles: [profileChain],
      })),
    )

    const res = await callGet()
    const data = await res.json() as Record<string, unknown>
    expect(data.released).toBe(1)
    expect(stripeMock.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(stripeMock.paymentIntents.cancel).not.toHaveBeenCalled()
  })
})

// ── Claims drift sweep (BUG-19 Phase 2) ───────────────────────────────────────
//
// Same cron route, same cadence: after the reaper pass, the route calls
// rpc('reconcile_coach_time_claims') to release any active coach_time_claims
// row whose source no longer holds. Triggers make claims transactionally
// consistent, so a non-zero count is DRIFT and must be logged loudly — and a
// sweep failure must never break the reaper (independent safety nets).

describe('GET /api/cron/release-expired-bookings — claims drift sweep', () => {
  it('runs the sweep every run and reports claims_reconciled', async () => {
    const candidatesChain = makeThenableChain({ data: [] })
    const rpc = jest.fn().mockResolvedValue({ data: 0, error: null })
    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({ bookings: [candidatesChain] }), rpc),
    )

    const res = await callGet()
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(rpc).toHaveBeenCalledWith('reconcile_coach_time_claims')
    expect(data.claims_reconciled).toBe(0)
  })

  it('logs loudly when the sweep releases drifted claims', async () => {
    const candidatesChain = makeThenableChain({ data: [] })
    const rpc = jest.fn().mockResolvedValue({ data: 2, error: null })
    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({ bookings: [candidatesChain] }), rpc),
    )

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const res = await callGet()
      const data = await res.json() as Record<string, unknown>
      expect(data.claims_reconciled).toBe(2)
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('coach_time_claims DRIFT'))
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('a failed sweep never breaks the reaper response', async () => {
    const candidatesChain = makeThenableChain({ data: [] })
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    ;(createAdminClient as MockFn).mockReturnValue(
      adminClient(mockFromTables({ bookings: [candidatesChain] }), rpc),
    )

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const res = await callGet()
      expect(res.status).toBe(200)
      const data = await res.json() as Record<string, unknown>
      expect(data.claims_reconciled).toBe(0)
    } finally {
      errorSpy.mockRestore()
    }
  })
})
