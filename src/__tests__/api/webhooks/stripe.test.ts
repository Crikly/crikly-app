// Integration tests for POST /api/webhooks/stripe (src/app/api/webhooks/stripe/route.ts)
//
// The Stripe SDK is mocked via @/lib/stripe/client. The raw body → signature
// verification chain is short-circuited by mocking stripe.webhooks.constructEvent
// to either return a fake event or throw.
//
// Business rules and security rules covered:
//   BR-06  payment_intent.succeeded → booking flipped to 'confirmed'.
//   BR-07  payment_intent.succeeded → messaging_unlocked=true.
//   Idempotency: redelivery of payment_intent.succeeded when booking already
//                confirmed → no-op, still returns 200.
//   payment_intent.payment_failed → audit row records error code/message.
//   Signature failure → 400 (never 200, never triggers DB writes).
//   Unknown event type → 200, no crash.
//   DB error inside handler → 200 (never cause Stripe retry loops).

// ── Module mocks (must appear before any imports) ─────────────────────────────

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/resend/send-booking-confirmation', () => ({
  sendBookingConfirmation: jest.fn(),
}))

jest.mock('@/lib/resend/send-programme-confirmation', () => ({
  sendProgrammeConfirmation: jest.fn(),
}))

jest.mock('@/lib/resend/send-new-booking-to-coach', () => ({
  sendNewBookingNotification: jest.fn(),
}))

jest.mock('@/lib/resend/send-ops-alert', () => ({
  sendOpsAlert: jest.fn().mockResolvedValue(true),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import { sendBookingConfirmation } from '@/lib/resend/send-booking-confirmation'
import { sendProgrammeConfirmation } from '@/lib/resend/send-programme-confirmation'
import { sendNewBookingNotification } from '@/lib/resend/send-new-booking-to-coach'
import { sendOpsAlert } from '@/lib/resend/send-ops-alert'
import { POST } from '@/app/api/webhooks/stripe/route'

// ── Types ─────────────────────────────────────────────────────────────────────

type MockFn = jest.Mock

// ── Supabase chain builder ────────────────────────────────────────────────────

function makeChain(defaults: { data?: unknown; error?: unknown } = {}) {
  const chain: Record<string, MockFn> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'update', 'insert', 'filter', 'order', 'limit']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.single = jest.fn().mockResolvedValue({ data: defaults.data ?? null, error: defaults.error ?? null })
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: defaults.data ?? null, error: defaults.error ?? null })
  return chain
}

// ── Stripe fake-event builder ─────────────────────────────────────────────────

function makeStripeEvent(type: string, object: Record<string, unknown>) {
  return {
    id: `evt_test_${type.replace(/\./g, '_')}`,
    type,
    data: { object },
  }
}

const BOOKING_ID = 'booking-uuid-webhook-001'

function makeSucceededIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pi_test_succeeded',
    status: 'succeeded',
    metadata: { booking_id: BOOKING_ID },
    last_payment_error: null,
    ...overrides,
  }
}

function makeFailedIntent(errorCode = 'card_declined', errorMessage = 'Your card was declined.') {
  return {
    id: 'pi_test_failed',
    status: 'requires_payment_method',
    metadata: { booking_id: BOOKING_ID },
    last_payment_error: { code: errorCode, message: errorMessage },
  }
}

// ── Helper — build a NextRequest-like Request ─────────────────────────────────

function makeWebhookRequest(rawBody: string, signature = 'valid-sig') {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    body: rawBody,
  })
}

// ── BUG-15: admin-client wrapper with a permissive ledger interceptor ────────
//
// Every POST now begins with the stripe_webhook_events ledger (insert-first)
// and ends by marking it processed/failed. Intercepting that table keeps the
// per-test positional from() mocks unaware of the ledger; pass a custom
// ledgerChain to exercise replay / poison / ledger-down behaviour.

function makeLedgerChain(result: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  const chain: Record<string, MockFn> & { then?: unknown } = {}
  for (const m of ['insert', 'select', 'eq', 'update', 'single', 'delete', 'lt']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(resolved)
  return chain
}

function adminMock(from: unknown, rpc?: jest.Mock, ledgerChain?: ReturnType<typeof makeLedgerChain>) {
  const ledger = ledgerChain ?? makeLedgerChain()
  const wrapped = jest.fn((table: string) =>
    table === 'stripe_webhook_events' ? ledger : (from as (t: string) => unknown)(table),
  )
  return {
    from: wrapped,
    rpc: rpc ?? jest.fn().mockResolvedValue({ data: null, error: null }),
    __ledger: ledger,
  }
}

// ── Helper — call the route handler ──────────────────────────────────────────

async function callPost(rawBody: string, signature?: string) {
  return POST(makeWebhookRequest(rawBody, signature) as Parameters<typeof POST>[0])
}

// ── Setup ─────────────────────────────────────────────────────────────────────

// Provide env vars once at module level so lazy inits don't throw
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_placeholder'
process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-placeholder'

beforeEach(() => {
  jest.clearAllMocks()
  // Re-apply default mock implementations after clearAllMocks wipes them.
  // Construct inline each time so no shared state bleeds between tests.
  ;(getStripe as jest.Mock).mockReturnValue({
    webhooks: {
      constructEvent: jest.fn().mockImplementation(() => {
        throw new Error('Override constructEvent in your test')
      }),
    },
  })
  ;(createAdminClient as jest.Mock).mockReturnValue(adminMock(jest.fn()))
  // sendBookingConfirmation is a no-op by default — tests that care about it
  // override this. Existing tests use intents without guest_email metadata so the
  // route returns before ever calling this function.
  ;(sendBookingConfirmation as jest.Mock).mockResolvedValue(true)
  // sendProgrammeConfirmation is a no-op by default — enrolment tests override this.
  ;(sendProgrammeConfirmation as jest.Mock).mockResolvedValue(true)
  // CF-NOTIFY-02: coach notification is a no-op by default — its lookups fail
  // fast against positional mocks (caught by the route's try/catch), so
  // pre-existing tests are unaffected; the dedicated describe block overrides.
  ;(sendNewBookingNotification as jest.Mock).mockResolvedValue(true)
})

// ── Signature verification ────────────────────────────────────────────────────

describe('POST /api/webhooks/stripe — signature verification', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const stripeMock = { webhooks: { constructEvent: jest.fn() } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(jest.fn()))

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No stripe-signature header
      body: '{}',
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
  })

  it('returns 400 when constructEvent throws (signature mismatch / forgery)', async () => {
    const stripeMock = {
      webhooks: {
        constructEvent: jest.fn().mockImplementation(() => {
          throw new Error('No signatures found matching the expected signature')
        }),
      },
    }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(jest.fn()))

    const res = await callPost('{"forged":"payload"}', 'bad-sig')
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('Invalid signature')
  })

  it('does NOT call any DB handler when signature verification fails', async () => {
    const mockFrom = jest.fn()
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))
    const stripeMock = {
      webhooks: {
        constructEvent: jest.fn().mockImplementation(() => { throw new Error('sig fail') }),
      },
    }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    await callPost('{}', 'bad-sig')
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ── payment_intent.succeeded ──────────────────────────────────────────────────

describe('POST /api/webhooks/stripe — payment_intent.succeeded', () => {
  function setupSucceededMocks(bookingUpdateData: unknown[] | null = [{ id: BOOKING_ID, booking_reference: 'CRK-2026-TEST01' }]) {
    const piUpdateResult = { data: null, error: null }

    // Build update chains that resolve correctly
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue(piUpdateResult),
    })

    const bookingChain: Record<string, MockFn> = {}
    bookingChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: bookingUpdateData,
            error: null,
          }),
        }),
      }),
    })

    // BUG-13b: when the confirm UPDATE matches zero rows, the handler runs the
    // succeeded-after-release backstop, which reads the booking row. Default
    // here: an already-confirmed row → backstop no-ops (the idempotent path).
    const backstopLookupChain = makeChain({
      data: {
        id: BOOKING_ID,
        status: 'confirmed',
        deleted_at: null,
        cancellation_reason: null,
        booked_by_user_id: 'user-profile-1',
        booking_reference: 'CRK-2026-TEST01',
      },
    })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)              // payment_intents update
      .mockReturnValueOnce(bookingChain)         // bookings update
      .mockReturnValueOnce(backstopLookupChain)  // bookings backstop lookup (zero-rows branch only)

    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    const event = makeStripeEvent('payment_intent.succeeded', makeSucceededIntent())
    const stripeMock = {
      webhooks: {
        constructEvent: jest.fn().mockReturnValue(event),
      },
    }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    return { mockFrom, bookingChain, piChain }
  }

  it('returns 200 after valid payment_intent.succeeded', async () => {
    setupSucceededMocks()
    const res = await callPost('{"type":"payment_intent.succeeded"}')
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data.received).toBe(true)
  })

  it('BR-06: booking update targets status=confirmed and messaging_unlocked=true (BR-07)', async () => {
    const { bookingChain } = setupSucceededMocks()
    await callPost('{"type":"payment_intent.succeeded"}')

    const updateArg = (bookingChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.status).toBe('confirmed')
    expect(updateArg.messaging_unlocked).toBe(true)
  })

  it('booking update is scoped to status=pending_payment (idempotency guard)', async () => {
    const { bookingChain } = setupSucceededMocks()
    await callPost('{"type":"payment_intent.succeeded"}')

    // Check that the chain was called with booking_id then status='pending_payment'
    const updateReturn = (bookingChain.update as MockFn).mock.results[0].value as Record<string, MockFn>
    const firstEq = (updateReturn.eq as MockFn).mock.calls[0]
    expect(firstEq[0]).toBe('id')
    expect(firstEq[1]).toBe(BOOKING_ID)

    const secondEqReturn = (updateReturn.eq as MockFn).mock.results[0].value as Record<string, MockFn>
    const secondEq = (secondEqReturn.eq as MockFn).mock.calls[0]
    expect(secondEq[0]).toBe('status')
    expect(secondEq[1]).toBe('pending_payment')
  })

  it('idempotency: redelivery when booking already confirmed is a no-op, still returns 200', async () => {
    // Simulate: booking UPDATE returns empty array (booking not in pending_payment)
    setupSucceededMocks([])
    const res = await callPost('{"type":"payment_intent.succeeded"}')
    expect(res.status).toBe(200)
  })

  it('payment_intents row is updated to status=succeeded', async () => {
    const { piChain } = setupSucceededMocks()
    await callPost('{"type":"payment_intent.succeeded"}')

    const piUpdateArg = (piChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(piUpdateArg.status).toBe('succeeded')
  })

  it('BUG-15: returns 500 when the booking confirm write fails (transient — Stripe redelivers)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const piChain: Record<string, MockFn> = {}
      piChain.update = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      })
      const bookingChain: Record<string, MockFn> = {}
      bookingChain.update = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
          }),
        }),
      })
      const mockFrom = jest.fn().mockReturnValueOnce(piChain).mockReturnValueOnce(bookingChain)
      const admin = adminMock(mockFrom)
      ;(createAdminClient as MockFn).mockReturnValue(admin)

      const event = makeStripeEvent('payment_intent.succeeded', makeSucceededIntent())
      const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
      ;(getStripe as MockFn).mockReturnValue(stripeMock)

      const res = await callPost('{}')
      expect(res.status).toBe(500)
      // The ledger row was marked failed so the redelivery is admitted.
      expect(admin.__ledger.update).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('skips booking update when payment intent has no booking_id metadata', async () => {
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const bookingChain: Record<string, MockFn> = {}
    bookingChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)
      .mockReturnValueOnce(bookingChain)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    // Intent with NO booking_id in metadata
    const intentNoBookingId = makeSucceededIntent({ metadata: {} })
    const event = makeStripeEvent('payment_intent.succeeded', intentNoBookingId)
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const res = await callPost('{}')
    expect(res.status).toBe(200)
    // Booking update must NOT be called
    expect(bookingChain.update).not.toHaveBeenCalled()
  })
})

// ── payment_intent.payment_failed ─────────────────────────────────────────────

describe('POST /api/webhooks/stripe — payment_intent.payment_failed', () => {
  function setupFailedMocks(updateError: unknown = null) {
    // BUG-15 risk 5: the update is .eq(intent).neq('status','succeeded') —
    // the chain resolves at the .neq (downgrade guard).
    const piChain: Record<string, MockFn> = {}
    const neqMock = jest.fn().mockResolvedValue({ data: null, error: updateError })
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({ neq: neqMock }),
    })
    piChain.__neq = neqMock

    const mockFrom = jest.fn().mockReturnValue(piChain)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    const event = makeStripeEvent('payment_intent.payment_failed', makeFailedIntent())
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    return { piChain }
  }

  it('returns 200 after valid payment_intent.payment_failed', async () => {
    setupFailedMocks()
    const res = await callPost('{"type":"payment_intent.payment_failed"}')
    expect(res.status).toBe(200)
  })

  it('updates payment_intents status to failed', async () => {
    const { piChain } = setupFailedMocks()
    await callPost('{}')

    const updateArg = (piChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.status).toBe('failed')
  })

  it('records stripe_error_code from last_payment_error', async () => {
    const { piChain } = setupFailedMocks()
    await callPost('{}')

    const updateArg = (piChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.stripe_error_code).toBe('card_declined')
  })

  it('records stripe_error_message from last_payment_error', async () => {
    const { piChain } = setupFailedMocks()
    await callPost('{}')

    const updateArg = (piChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.stripe_error_message).toBe('Your card was declined.')
  })

  it('BUG-15: returns 500 when the payment_intents update fails (transient — Stripe redelivers)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      setupFailedMocks({ message: 'DB error' })
      const res = await callPost('{}')
      expect(res.status).toBe(500)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('BUG-15 risk 5: the failed update NEVER downgrades a succeeded audit row (.neq guard)', async () => {
    const { piChain } = setupFailedMocks()
    await callPost('{}')

    // .update(...).eq('stripe_payment_intent_id', id).neq('status', 'succeeded')
    const updateReturn = (piChain.update as MockFn).mock.results[0].value as Record<string, MockFn>
    const eqReturn = (updateReturn.eq as MockFn).mock.results[0].value as Record<string, MockFn>
    expect(eqReturn.neq).toHaveBeenCalledWith('status', 'succeeded')
  })

  it('returns 200 and does not crash for an unrecognised event type', async () => {
    const mockFrom = jest.fn()
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    const event = makeStripeEvent('customer.subscription.updated', { id: 'sub_test' })
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const res = await callPost('{}')
    expect(res.status).toBe(200)
    // No DB calls for an unrecognised event
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ── payment_intent.succeeded — email integration (P-00c-EMAIL) ────────────────
//
// The route calls sendBookingConfirmation after the pending_payment→confirmed
// transition succeeds. It first looks up the coach name via coach_profiles, then
// optionally user_profiles as a fallback. These tests verify:
//   - sendBookingConfirmation is called with the right params + totalPence = intent.amount
//   - Redelivery (already-confirmed, no rows updated) does NOT trigger a second email
//   - Email failure (sendBookingConfirmation returns false) still yields a 200 response
//   - Missing guest_email metadata skips the email but still returns 200

describe('POST /api/webhooks/stripe — payment_intent.succeeded email (P-00c-EMAIL)', () => {
  const BOOKING_WITH_EMAIL = {
    id: BOOKING_ID,
    booking_reference: 'CRK-2026-TEST01',
    coach_profile_id: 'coach-profile-uuid-001',
    session_date: '2026-08-15',
    session_start_time: '10:00:00',
    session_end_time: '11:00:00',
    session_type: 'individual',
  }

  const INTENT_AMOUNT = 6600

  function makeIntentWithGuestEmail(overrides: Record<string, unknown> = {}) {
    return {
      id: 'pi_test_with_email',
      status: 'succeeded',
      amount: INTENT_AMOUNT,
      metadata: {
        booking_id: BOOKING_ID,
        guest_email: 'sarah@example.com',
        guest_name: 'Sarah Test',
        // UX-16: who the session is for — stashed as strings at PI creation.
        participant_name: 'Yuwin',
        participant_age: '10',
      },
      last_payment_error: null,
      ...overrides,
    }
  }

  /**
   * Builds the full chain of from() calls needed for a succeeded + email path:
   *   1. payment_intents update (audit row → succeeded)
   *   2. bookings update (pending_payment → confirmed) → returns BOOKING_WITH_EMAIL
   *   3. coach_profiles maybySingle → returns display_name
   *   [4. user_profiles maybySingle — only reached if display_name is null]
   */
  function setupEmailMocks(options: {
    bookingUpdateData?: unknown[] | null
    coachRow?: { display_name: string | null; user_profile_id: string | null } | null
    userProfileRow?: { full_name: string } | null
    intentOverrides?: Record<string, unknown>
  } = {}) {
    const {
      bookingUpdateData = [BOOKING_WITH_EMAIL],
      coachRow = { display_name: 'Coach Davies', user_profile_id: null },
      userProfileRow = null,
      intentOverrides = {},
    } = options

    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })

    const bookingChain: Record<string, MockFn> = {}
    bookingChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: bookingUpdateData,
            error: null,
          }),
        }),
      }),
    })

    // coach_profiles lookup — uses .select().eq().maybySingle()
    const coachChain: Record<string, MockFn> = {}
    for (const m of ['select', 'eq']) {
      coachChain[m] = jest.fn(() => coachChain)
    }
    coachChain.maybeSingle = jest.fn().mockResolvedValue({ data: coachRow, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)      // 1. payment_intents update
      .mockReturnValueOnce(bookingChain) // 2. bookings update

    if (coachRow !== null && !coachRow.display_name && coachRow.user_profile_id) {
      // user_profiles fallback is needed only when display_name is absent
      const userChain: Record<string, MockFn> = {}
      for (const m of ['select', 'eq']) {
        userChain[m] = jest.fn(() => userChain)
      }
      userChain.maybeSingle = jest.fn().mockResolvedValue({ data: userProfileRow, error: null })

      mockFrom
        .mockReturnValueOnce(coachChain)  // 3. coach_profiles
        .mockReturnValueOnce(userChain)   // 4. user_profiles
    } else {
      mockFrom.mockReturnValueOnce(coachChain) // 3. coach_profiles
    }

    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    const intent = makeIntentWithGuestEmail(intentOverrides)
    const event = makeStripeEvent('payment_intent.succeeded', intent)
    const stripeMock = {
      webhooks: { constructEvent: jest.fn().mockReturnValue(event) },
    }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    return { mockFrom, bookingChain, piChain, coachChain, intent }
  }

  it('calls sendBookingConfirmation after a successful pending_payment→confirmed transition', async () => {
    setupEmailMocks()

    await callPost('{}')

    expect(sendBookingConfirmation).toHaveBeenCalledTimes(1)
  })

  it('passes guestEmail from intent.metadata.guest_email to sendBookingConfirmation', async () => {
    setupEmailMocks()

    await callPost('{}')

    const [params] = (sendBookingConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.guestEmail).toBe('sarah@example.com')
  })

  it('passes participantName and participantAge (parsed to a number) from intent metadata — UX-16', async () => {
    setupEmailMocks()

    await callPost('{}')

    const [params] = (sendBookingConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.participantName).toBe('Yuwin')
    expect(params.participantAge).toBe(10)
  })

  it('passes undefined participant fields for pre-UX-16 intents without participant metadata', async () => {
    setupEmailMocks({
      intentOverrides: {
        metadata: {
          booking_id: BOOKING_ID,
          guest_email: 'sarah@example.com',
          guest_name: 'Sarah Test',
        },
      },
    })

    await callPost('{}')

    const [params] = (sendBookingConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.participantName).toBeUndefined()
    expect(params.participantAge).toBeUndefined()
  })

  it('passes guestName from intent.metadata.guest_name to sendBookingConfirmation', async () => {
    setupEmailMocks()

    await callPost('{}')

    const [params] = (sendBookingConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.guestName).toBe('Sarah Test')
  })

  it('passes totalPence = intent.amount (the canonical charged amount)', async () => {
    setupEmailMocks()

    await callPost('{}')

    const [params] = (sendBookingConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.totalPence).toBe(INTENT_AMOUNT)
  })

  it('passes the booking reference from the confirmed booking row', async () => {
    setupEmailMocks()

    await callPost('{}')

    const [params] = (sendBookingConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.bookingReference).toBe('CRK-2026-TEST01')
  })

  it('uses coach_profiles.display_name as coachName when present', async () => {
    setupEmailMocks({ coachRow: { display_name: 'Coach Davies', user_profile_id: null } })

    await callPost('{}')

    const [params] = (sendBookingConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.coachName).toBe('Coach Davies')
  })

  it('falls back to user_profiles.full_name when display_name is null', async () => {
    setupEmailMocks({
      coachRow: { display_name: null, user_profile_id: 'user-profile-uuid-001' },
      userProfileRow: { full_name: 'James Wilson' },
    })

    await callPost('{}')

    const [params] = (sendBookingConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.coachName).toBe('James Wilson')
  })

  it('uses "your coach" as coachName fallback when coach_profiles row is null', async () => {
    setupEmailMocks({ coachRow: null })

    await callPost('{}')

    const [params] = (sendBookingConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.coachName).toBe('your coach')
  })

  it('still returns 200 when sendBookingConfirmation returns false (email failed)', async () => {
    ;(sendBookingConfirmation as MockFn).mockResolvedValue(false)
    setupEmailMocks()

    const res = await callPost('{}')

    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data.received).toBe(true)
  })

  it('still returns 200 when sendBookingConfirmation throws unexpectedly', async () => {
    ;(sendBookingConfirmation as MockFn).mockRejectedValue(new Error('Unexpected crash'))
    setupEmailMocks()

    const res = await callPost('{}')

    expect(res.status).toBe(200)
  })

  it('redelivery: does NOT call sendBookingConfirmation when booking already confirmed (empty update result)', async () => {
    // Simulate redelivery: bookings update returns empty array (already confirmed)
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })

    const bookingChain: Record<string, MockFn> = {}
    bookingChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    // The empty confirm result enters the BUG-13b backstop, which looks the
    // row up — a normally-confirmed row (not release-marked) is the
    // idempotent redelivery case.
    const lookupChain = makeChain({
      data: { id: BOOKING_ID, status: 'confirmed', deleted_at: null, cancellation_reason: null, booked_by_user_id: 'u1', booking_reference: 'CRK-2026-TEST01' },
    })
    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(lookupChain)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    const intent = makeIntentWithGuestEmail()
    const event = makeStripeEvent('payment_intent.succeeded', intent)
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const res = await callPost('{}')

    expect(res.status).toBe(200)
    expect(sendBookingConfirmation).not.toHaveBeenCalled()
  })

  it('missing guest_email metadata: skips email but still returns 200', async () => {
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })

    const bookingChain: Record<string, MockFn> = {}
    bookingChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: [BOOKING_WITH_EMAIL],
            error: null,
          }),
        }),
      }),
    })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)
      .mockReturnValueOnce(bookingChain)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    // Intent with booking_id but NO guest_email
    const intentNoEmail = {
      id: 'pi_test_no_email',
      status: 'succeeded',
      amount: INTENT_AMOUNT,
      metadata: { booking_id: BOOKING_ID },
      last_payment_error: null,
    }
    const event = makeStripeEvent('payment_intent.succeeded', intentNoEmail)
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const res = await callPost('{}')

    expect(res.status).toBe(200)
    expect(sendBookingConfirmation).not.toHaveBeenCalled()
  })

  it('uses "there" as guestName fallback when guest_name metadata is absent', async () => {
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })

    const bookingChain: Record<string, MockFn> = {}
    bookingChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: [BOOKING_WITH_EMAIL],
            error: null,
          }),
        }),
      }),
    })

    const coachChain: Record<string, MockFn> = {}
    for (const m of ['select', 'eq']) {
      coachChain[m] = jest.fn(() => coachChain)
    }
    coachChain.maybeSingle = jest.fn().mockResolvedValue({
      data: { display_name: 'Coach Davies', user_profile_id: null },
      error: null,
    })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(coachChain)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    // Intent has guest_email but no guest_name
    const intentNoName = {
      id: 'pi_test_no_name',
      status: 'succeeded',
      amount: INTENT_AMOUNT,
      metadata: { booking_id: BOOKING_ID, guest_email: 'sarah@example.com' },
      last_payment_error: null,
    }
    const event = makeStripeEvent('payment_intent.succeeded', intentNoName)
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    await callPost('{}')

    const [params] = (sendBookingConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.guestName).toBe('there')
  })
})

// ── payment_intent.succeeded — handleEnrolmentSucceeded (P-00c-ENROL) ─────────
//
// When a payment intent carries metadata.enrolment_id (not booking_id), the route
// takes the enrolment path (handleEnrolmentSucceeded) instead of the booking path.
//
// DB call sequence for handleEnrolmentSucceeded:
//   1. payment_intents update (status → succeeded)
//   2. group_programme_enrolments update (pending → succeeded) + select
//   3. adminSupabase.rpc('increment_programme_spots', { p_programme_id })
//   4. group_programmes select (for email data)
//   5. coach_profiles select (for coach name)
//   6. sendProgrammeConfirmation

const ENROLMENT_ID = 'enrolment-uuid-webhook-001'
const PROGRAMME_ID_WH = 'programme-uuid-webhook-001'

function makeEnrolmentSucceededIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pi_test_enrolment',
    status: 'succeeded',
    amount: 24640,
    metadata: {
      enrolment_id: ENROLMENT_ID,
      guest_email: 'sarah@example.com',
      guest_name: 'Sarah Test',
    },
    last_payment_error: null,
    ...overrides,
  }
}

const CONFIRMED_ENROLMENT = {
  id: ENROLMENT_ID,
  programme_id: PROGRAMME_ID_WH,
  enrolment_reference: 'CRK-2026-ENROL1',
  payment_model: 'block',
  sessions_paid_for: 8,
}

const PROGRAMME_ROW_WH = {
  title: 'Summer Cricket Academy',
  day_of_week: 6,
  days_of_week: null,
  start_time: '09:00:00',
  duration_minutes: 60,
  coach_profile_id: 'coach-profile-uuid-webhook-001',
}

/**
 * Build the full chain of from() and rpc() calls for a happy enrolment webhook.
 *
 * Supabase call order in handleEnrolmentSucceeded (BUG-23: the programme is
 * fetched BEFORE the spot claim so camp_mode can pick the capacity mechanism):
 *   from(1) payment_intents update
 *   from(2) group_programme_enrolments update + select
 *   from(3) group_programmes select
 *   rpc()   increment_programme_spots (non-camp) | confirm_camp_slot_spots (camp)
 *   [camp only] from(4) group_programme_enrolment_sessions, from(5) group_programme_sessions
 *   from(last) coach_profiles select
 */
function setupEnrolmentMocks(options: {
  /** confirm_programme_enrolment RPC result (BUG-15 atomic confirm-and-claim). */
  rpcResult?: { confirmed: boolean; spot_claimed: boolean }
  coachRow?: { display_name: string | null; user_profile_id: string | null } | null
} = {}) {
  const {
    rpcResult = { confirmed: true, spot_claimed: true },
    coachRow = { display_name: 'Coach Davies', user_profile_id: null },
  } = options

  // 1. payment_intents update
  const piChain: Record<string, MockFn> = {}
  piChain.update = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ data: null, error: null }),
  })

  // 2. group_programme_enrolments READ-BACK for the email (BUG-15: the
  //    confirm+claim happens atomically inside the RPC, not via update here)
  const enrolmentChain: Record<string, MockFn> = {}
  for (const m of ['select', 'eq']) {
    enrolmentChain[m] = jest.fn(() => enrolmentChain)
  }
  enrolmentChain.maybeSingle = jest.fn().mockResolvedValue({ data: CONFIRMED_ENROLMENT, error: null })

  // 3. group_programmes select
  const programmeChain: Record<string, MockFn> = {}
  for (const m of ['select', 'eq']) {
    programmeChain[m] = jest.fn(() => programmeChain)
  }
  programmeChain.maybeSingle = jest.fn().mockResolvedValue({ data: PROGRAMME_ROW_WH, error: null })

  // 4. coach_profiles select
  const coachChain: Record<string, MockFn> = {}
  for (const m of ['select', 'eq']) {
    coachChain[m] = jest.fn(() => coachChain)
  }
  coachChain.maybeSingle = jest.fn().mockResolvedValue({ data: coachRow, error: null })

  const mockFrom = jest.fn()
    .mockReturnValueOnce(piChain)         // 1. payment_intents
    .mockReturnValueOnce(enrolmentChain)  // 2. group_programme_enrolments read-back
    .mockReturnValueOnce(programmeChain)  // 3. group_programmes
    .mockReturnValueOnce(coachChain)      // 4. coach_profiles

  const mockRpc = jest.fn().mockResolvedValue({ data: rpcResult, error: null })

  ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom, mockRpc))

  const intent = makeEnrolmentSucceededIntent()
  const event = makeStripeEvent('payment_intent.succeeded', intent)
  const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
  ;(getStripe as MockFn).mockReturnValue(stripeMock)

  return { mockFrom, mockRpc, piChain, enrolmentChain, programmeChain, coachChain, intent }
}

// ── CF-NOTIFY-02: coach new-booking notification ──────────────────────────────

describe('POST /api/webhooks/stripe — coach notification email (CF-NOTIFY-02)', () => {
  const COACH_BOOKING = {
    id: BOOKING_ID,
    booking_reference: 'CRK-2026-TEST01',
    coach_profile_id: 'coach-profile-uuid-001',
    session_date: '2026-08-15',
    session_start_time: '14:00:00',
    session_end_time: '15:00:00',
    session_type: 'individual',
    coach_price_pence: 4000,
    sport_id: 'sport-cricket-uuid',
  }

  // intent.amount is the PARENT total (coach price + commission) — the tests
  // assert the coach email never uses it for the payout line (BR-01).
  const PARENT_TOTAL = 4400

  /**
   * Table-keyed from() mock (not positional): the guest email helper and the
   * coach helper both read coach_profiles/user_profiles, so keying by table
   * keeps the harness independent of call order.
   */
  function setupCoachEmailMocks(options: {
    bookingUpdateData?: unknown[] | null
    coachRow?: Record<string, unknown> | null
    coachUserRow?: Record<string, unknown> | null
    authEmail?: string | null
    sportRow?: Record<string, unknown> | null
    intentMetadata?: Record<string, unknown>
  } = {}) {
    const {
      bookingUpdateData = [COACH_BOOKING],
      coachRow = { display_name: 'Coach Davies', user_profile_id: 'up-coach-001' },
      coachUserRow = { full_name: 'Owen Davies', auth_user_id: 'auth-coach-001' },
      authEmail = 'coach@example.com',
      sportRow = { name: 'Cricket' },
      intentMetadata = { booking_id: BOOKING_ID, guest_name: 'Sarah Test' },
    } = options

    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })

    const bookingChain: Record<string, MockFn> = {}
    bookingChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ data: bookingUpdateData, error: null }),
        }),
      }),
    })

    const coachChain = makeChain({ data: coachRow })
    const userChain = makeChain({ data: coachUserRow })
    const sportsChain = makeChain({ data: sportRow })
    // Backstop lookup on the zero-rows branch reads bookings via makeChain —
    // give it an already-confirmed row so the redelivery test no-ops cleanly.
    const backstopChain = makeChain({
      data: {
        id: BOOKING_ID,
        status: 'confirmed',
        deleted_at: null,
        cancellation_reason: null,
        booked_by_user_id: 'user-profile-1',
        booking_reference: 'CRK-2026-TEST01',
      },
    })

    let bookingCalls = 0
    const mockFrom = jest.fn((table: string) => {
      if (table === 'payment_intents') return piChain
      if (table === 'bookings') {
        bookingCalls += 1
        return bookingCalls === 1 ? bookingChain : backstopChain
      }
      if (table === 'coach_profiles') return coachChain
      if (table === 'user_profiles') return userChain
      if (table === 'sports') return sportsChain
      return makeChain()
    })

    const admin = {
      ...adminMock(mockFrom),
      auth: {
        admin: {
          getUserById: jest.fn().mockResolvedValue({
            data: authEmail ? { user: { email: authEmail } } : { user: null },
            error: null,
          }),
        },
      },
    }
    ;(createAdminClient as MockFn).mockReturnValue(admin)

    const intent = {
      id: 'pi_test_coach_email',
      status: 'succeeded',
      amount: PARENT_TOTAL,
      metadata: intentMetadata,
      last_payment_error: null,
    }
    const event = makeStripeEvent('payment_intent.succeeded', intent)
    ;(getStripe as MockFn).mockReturnValue({
      webhooks: { constructEvent: jest.fn().mockReturnValue(event) },
    })

    return { mockFrom, bookingChain, admin, intent }
  }

  it('calls sendNewBookingNotification after a successful pending_payment→confirmed transition', async () => {
    setupCoachEmailMocks()

    const res = await callPost('{}')

    expect(res.status).toBe(200)
    expect(sendNewBookingNotification).toHaveBeenCalledTimes(1)
  })

  it('BR-01: passes coachPricePence from the booking row — never intent.amount (parent total)', async () => {
    setupCoachEmailMocks()

    await callPost('{}')

    const [params] = (sendNewBookingNotification as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.coachPricePence).toBe(4000)
    expect(params.coachPricePence).not.toBe(PARENT_TOTAL)
  })

  it('resolves coachEmail via user_profiles.auth_user_id → auth.admin.getUserById', async () => {
    const { admin } = setupCoachEmailMocks()

    await callPost('{}')

    expect(admin.auth.admin.getUserById).toHaveBeenCalledWith('auth-coach-001')
    const [params] = (sendNewBookingNotification as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.coachEmail).toBe('coach@example.com')
  })

  it('passes coachName from display_name, parentName from guest_name, sport name, reference and dashboard URL', async () => {
    setupCoachEmailMocks()

    await callPost('{}')

    const [params] = (sendNewBookingNotification as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.coachName).toBe('Coach Davies')
    expect(params.parentName).toBe('Sarah Test')
    expect(params.sport).toBe('Cricket')
    expect(params.bookingReference).toBe('CRK-2026-TEST01')
    expect(params.dashboardUrl).toContain(`/coach/bookings/${BOOKING_ID}`)
  })

  it('falls back to user_profiles.full_name when display_name is null', async () => {
    setupCoachEmailMocks({ coachRow: { display_name: null, user_profile_id: 'up-coach-001' } })

    await callPost('{}')

    const [params] = (sendNewBookingNotification as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.coachName).toBe('Owen Davies')
  })

  it('fires independently of the guest email — sends even when guest_email metadata is absent', async () => {
    setupCoachEmailMocks({ intentMetadata: { booking_id: BOOKING_ID, guest_name: 'Sarah Test' } })

    await callPost('{}')

    expect(sendBookingConfirmation).not.toHaveBeenCalled()
    expect(sendNewBookingNotification).toHaveBeenCalledTimes(1)
  })

  it('uses "A parent" as parentName fallback when guest_name metadata is absent', async () => {
    setupCoachEmailMocks({ intentMetadata: { booking_id: BOOKING_ID } })

    await callPost('{}')

    const [params] = (sendNewBookingNotification as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.parentName).toBe('A parent')
  })

  it('idempotency: redelivery (booking already confirmed, empty update result) sends NO coach email', async () => {
    setupCoachEmailMocks({ bookingUpdateData: [] })

    const res = await callPost('{}')

    expect(res.status).toBe(200)
    expect(sendNewBookingNotification).not.toHaveBeenCalled()
  })

  it('still returns 200 when sendNewBookingNotification returns false (email failed)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      setupCoachEmailMocks()
      ;(sendNewBookingNotification as MockFn).mockResolvedValue(false)

      const res = await callPost('{}')

      expect(res.status).toBe(200)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('still returns 200 when sendNewBookingNotification throws unexpectedly (never a webhook retry)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { admin } = setupCoachEmailMocks()
      ;(sendNewBookingNotification as MockFn).mockRejectedValue(new Error('Resend exploded'))

      const res = await callPost('{}')

      expect(res.status).toBe(200)
      // Ledger marked processed, not failed — no Stripe redelivery.
      const ledgerUpdates = (admin.__ledger.update as MockFn).mock.calls
      expect(ledgerUpdates[ledgerUpdates.length - 1][0]).toMatchObject({ status: 'processed' })
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('skips the coach email (still 200) when the coach_profiles lookup returns nothing', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      setupCoachEmailMocks({ coachRow: null })

      const res = await callPost('{}')

      expect(res.status).toBe(200)
      expect(sendNewBookingNotification).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('skips the coach email (still 200) when the coach auth user has no email', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      setupCoachEmailMocks({ authEmail: null })

      const res = await callPost('{}')

      expect(res.status).toBe(200)
      expect(sendNewBookingNotification).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('falls back to the generic sport label when the sports lookup returns nothing', async () => {
    setupCoachEmailMocks({ sportRow: null })

    await callPost('{}')

    const [params] = (sendNewBookingNotification as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.sport).toBe('Coaching session')
  })

  it('fires from the succeeded-after-release restore path too (BUG-13b backstop)', async () => {
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })

    // Confirm UPDATE matches zero rows → backstop lookup finds a release-marked
    // row → restore succeeds and returns the widened booking row.
    const confirmChain: Record<string, MockFn> = {}
    confirmChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const lookupChain = makeChain({
      data: {
        id: BOOKING_ID,
        status: 'pending_payment',
        deleted_at: '2026-07-05T09:00:00.000Z',
        cancellation_reason: 'expired_pending_payment',
        booked_by_user_id: 'prov-user-1',
        booking_reference: 'CRK-2026-TEST01',
      },
    })

    const restoreChain: Record<string, MockFn> = {}
    restoreChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          not: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: [COACH_BOOKING], error: null }),
          }),
        }),
      }),
    })

    const profileRestoreChain: Record<string, MockFn> = {}
    profileRestoreChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })

    const coachChain = makeChain({ data: { display_name: 'Coach Davies', user_profile_id: 'up-coach-001' } })
    const coachUserChain = makeChain({ data: { full_name: 'Owen Davies', auth_user_id: 'auth-coach-001' } })
    const sportsChain = makeChain({ data: { name: 'Cricket' } })

    let bookingsCalls = 0
    let userProfilesCalls = 0
    const mockFrom = jest.fn((table: string) => {
      if (table === 'payment_intents') return piChain
      if (table === 'bookings') {
        bookingsCalls += 1
        if (bookingsCalls === 1) return confirmChain
        if (bookingsCalls === 2) return lookupChain
        return restoreChain
      }
      if (table === 'user_profiles') {
        userProfilesCalls += 1
        return userProfilesCalls === 1 ? profileRestoreChain : coachUserChain
      }
      if (table === 'coach_profiles') return coachChain
      if (table === 'sports') return sportsChain
      return makeChain()
    })

    const admin = {
      ...adminMock(mockFrom),
      auth: {
        admin: {
          getUserById: jest.fn().mockResolvedValue({
            data: { user: { email: 'coach@example.com' } },
            error: null,
          }),
        },
      },
    }
    ;(createAdminClient as MockFn).mockReturnValue(admin)

    const intent = {
      id: 'pi_test_restore_coach',
      status: 'succeeded',
      amount: PARENT_TOTAL,
      metadata: { booking_id: BOOKING_ID, guest_name: 'Sarah Test' },
      last_payment_error: null,
    }
    const event = makeStripeEvent('payment_intent.succeeded', intent)
    ;(getStripe as MockFn).mockReturnValue({
      webhooks: { constructEvent: jest.fn().mockReturnValue(event) },
    })

    const res = await callPost('{}')

    expect(res.status).toBe(200)
    expect(sendNewBookingNotification).toHaveBeenCalledTimes(1)
    const [params] = (sendNewBookingNotification as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.coachPricePence).toBe(4000)
    expect(params.coachEmail).toBe('coach@example.com')
  })

  it('does NOT fire for enrolment intents (programme path untouched)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      setupCoachEmailMocks({
        intentMetadata: { enrolment_id: 'enrolment-uuid-001', guest_name: 'Sarah Test' },
      })

      await callPost('{}')

      expect(sendNewBookingNotification).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('POST /api/webhooks/stripe — handleEnrolmentSucceeded (P-00c-ENROL)', () => {
  it('routes to enrolment path when metadata.enrolment_id is present', async () => {
    setupEnrolmentMocks()
    const res = await callPost('{}')
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data.received).toBe(true)
  })

  it('updates payment_intents to status=succeeded', async () => {
    const { piChain } = setupEnrolmentMocks()
    await callPost('{}')

    const updateArg = (piChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.status).toBe('succeeded')
  })

  it('delegates confirm-and-claim to confirm_programme_enrolment atomically (BUG-15)', async () => {
    const { mockRpc, intent } = setupEnrolmentMocks()
    await callPost('{}')

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('confirm_programme_enrolment', {
      p_enrolment_id: ENROLMENT_ID,
      p_intent_id: intent.id,
      p_amount_pence: intent.amount,
      p_currency: 'GBP',
    })
    // The spot-claim functions are INSIDE the DB transaction now — the
    // webhook must never call them directly.
    const calledFns = mockRpc.mock.calls.map((c) => c[0])
    expect(calledFns).not.toContain('increment_programme_spots')
    expect(calledFns).not.toContain('confirm_camp_slot_spots')
  })

  it('idempotency: returns 200 and sends nothing when the RPC reports confirmed:false (redelivery)', async () => {
    const { mockFrom } = setupEnrolmentMocks({ rpcResult: { confirmed: false, spot_claimed: false } })
    const res = await callPost('{}')
    expect(res.status).toBe(200)
    expect(sendProgrammeConfirmation).not.toHaveBeenCalled()
    // Only the payment_intents audit update ran — no email read-backs.
    expect((mockFrom as MockFn).mock.calls.length).toBe(1)
  })

  it('spot_claimed:false → 200, MANUAL REFUND log, ops alert, and the confirmation email is SUPPRESSED', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      setupEnrolmentMocks({ rpcResult: { confirmed: true, spot_claimed: false } })
      const res = await callPost('{}')
      expect(res.status).toBe(200)

      const logged = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(logged).toContain('MANUAL REFUND NEEDED')
      // Approved ruling: a parent with no spot must not receive "You're
      // enrolled!" — the payment_alerts row (written inside the RPC) + ops
      // email are the channel.
      expect(sendProgrammeConfirmation).not.toHaveBeenCalled()
      expect(sendOpsAlert).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'needs_refund' }),
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('calls sendProgrammeConfirmation (not sendBookingConfirmation)', async () => {
    setupEnrolmentMocks()
    await callPost('{}')

    expect(sendProgrammeConfirmation).toHaveBeenCalledTimes(1)
    expect(sendBookingConfirmation).not.toHaveBeenCalled()
  })

  it('passes guestEmail and guestName from intent metadata to sendProgrammeConfirmation', async () => {
    setupEnrolmentMocks()
    await callPost('{}')

    const [params] = (sendProgrammeConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.guestEmail).toBe('sarah@example.com')
    expect(params.guestName).toBe('Sarah Test')
  })

  it('passes enrolmentReference and totalPence = intent.amount to sendProgrammeConfirmation', async () => {
    setupEnrolmentMocks()
    await callPost('{}')

    const [params] = (sendProgrammeConfirmation as MockFn).mock.calls[0] as [Record<string, unknown>]
    expect(params.enrolmentReference).toBe('CRK-2026-ENROL1')
    expect(params.totalPence).toBe(24640)
  })

  it('skips email when guest_email is absent from intent metadata', async () => {
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const enrolmentChain: Record<string, MockFn> = {}
    enrolmentChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ data: [CONFIRMED_ENROLMENT], error: null }),
        }),
      }),
    })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)
      .mockReturnValueOnce(enrolmentChain)
    const mockRpc = jest.fn().mockResolvedValue({ data: true, error: null })
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom, mockRpc))

    // No guest_email in metadata
    const intent = makeEnrolmentSucceededIntent({ metadata: { enrolment_id: ENROLMENT_ID } })
    const event = makeStripeEvent('payment_intent.succeeded', intent)
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const res = await callPost('{}')
    expect(res.status).toBe(200)
    expect(sendProgrammeConfirmation).not.toHaveBeenCalled()
  })

  it('does NOT invoke the booking path (sendBookingConfirmation) for enrolment intents', async () => {
    setupEnrolmentMocks()
    await callPost('{}')
    expect(sendBookingConfirmation).not.toHaveBeenCalled()
  })

  it('BUG-15: returns 500 when the confirm RPC fails (transient — Stripe redelivers)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const piChain: Record<string, MockFn> = {}
      piChain.update = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      })
      const mockFrom = jest.fn().mockReturnValueOnce(piChain)
      const mockRpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } })
      ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom, mockRpc))

      const intent = makeEnrolmentSucceededIntent()
      const event = makeStripeEvent('payment_intent.succeeded', intent)
      const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
      ;(getStripe as MockFn).mockReturnValue(stripeMock)

      const res = await callPost('{}')
      expect(res.status).toBe(500)
      expect(sendProgrammeConfirmation).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })
})

// ── payment_intent.payment_failed — enrolment failure path ────────────────────
//
// When a failed intent has metadata.enrolment_id, the route also marks the
// group_programme_enrolments row failed (only while still pending). The payment_intents
// row is always updated. This section tests the combined payment_failed + enrolment path.

describe('POST /api/webhooks/stripe — payment_intent.payment_failed (enrolment path)', () => {
  function makeFailedEnrolmentIntent() {
    return {
      id: 'pi_test_enrolment_failed',
      status: 'requires_payment_method',
      metadata: { enrolment_id: ENROLMENT_ID },
      last_payment_error: { code: 'card_declined', message: 'Your card was declined.' },
    }
  }

  it('updates payment_intents to status=failed for a failed enrolment intent', async () => {
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        neq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })
    const enrolmentFailChain: Record<string, MockFn> = {}
    enrolmentFailChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)             // payment_intents update
      .mockReturnValueOnce(enrolmentFailChain)  // group_programme_enrolments update

    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom, jest.fn()))

    const event = makeStripeEvent('payment_intent.payment_failed', makeFailedEnrolmentIntent())
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const res = await callPost('{}')
    expect(res.status).toBe(200)

    const piUpdateArg = (piChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(piUpdateArg.status).toBe('failed')
  })

  it('marks group_programme_enrolments payment_status=failed (scoped to pending)', async () => {
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        neq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })
    const enrolmentFailChain: Record<string, MockFn> = {}
    enrolmentFailChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)
      .mockReturnValueOnce(enrolmentFailChain)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom, jest.fn()))

    const event = makeStripeEvent('payment_intent.payment_failed', makeFailedEnrolmentIntent())
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    await callPost('{}')

    const enrolmentUpdateArg = (enrolmentFailChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(enrolmentUpdateArg.payment_status).toBe('failed')

    // Idempotency guard — scoped to pending
    const updateReturn = (enrolmentFailChain.update as MockFn).mock.results[0].value as Record<string, MockFn>
    const firstEqReturn = (updateReturn.eq as MockFn).mock.results[0].value as Record<string, MockFn>
    const secondEqCall = (firstEqReturn.eq as MockFn).mock.calls[0]
    expect(secondEqCall[0]).toBe('payment_status')
    expect(secondEqCall[1]).toBe('pending')
  })
})

// ── payment_intent.canceled (BUG-13b) ─────────────────────────────────────────

describe('POST /api/webhooks/stripe — payment_intent.canceled (BUG-13b)', () => {
  function makeCanceledIntent(metadata: Record<string, string> = { booking_id: BOOKING_ID }) {
    return { id: 'pi_test_canceled', status: 'canceled', metadata, last_payment_error: null }
  }

  /**
   * from() sequence for a booking-intent cancel:
   *   1. payment_intents — update → eq → neq (never downgrade succeeded)
   *   2. bookings        — release update → eq → eq → is → select
   *   3. user_profiles   — provisional soft-delete → eq → eq → is  (only if released)
   */
  function setupCanceledMocks(releasedData: unknown[] = [{ id: BOOKING_ID, booked_by_user_id: 'prov-user-1' }]) {
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        neq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })

    const bookingChain: Record<string, MockFn> = {}
    bookingChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          is: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: releasedData, error: null }),
          }),
        }),
      }),
    })

    const profileChain: Record<string, MockFn> = {}
    profileChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          is: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(profileChain)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    const event = makeStripeEvent('payment_intent.canceled', makeCanceledIntent())
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    return { mockFrom, piChain, bookingChain, profileChain }
  }

  it('releases the booking: soft delete + release reason, status untouched', async () => {
    const { bookingChain } = setupCanceledMocks()
    const res = await callPost('{"type":"payment_intent.canceled"}')
    expect(res.status).toBe(200)

    const updateArg = (bookingChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.deleted_at).toBeTruthy()
    expect(updateArg.cancelled_at).toBeTruthy()
    expect(updateArg.cancellation_reason).toBe('payment_intent_cancelled')
    // Release NEVER rewrites status — 'pending_payment' + deleted_at + reason
    // IS the released state (BUG-13b Step 0 semantics).
    expect(updateArg.status).toBeUndefined()
  })

  it('release is scoped to live pending_payment rows (idempotency guard)', async () => {
    const { bookingChain } = setupCanceledMocks()
    await callPost('{}')

    const updateReturn = (bookingChain.update as MockFn).mock.results[0].value as Record<string, MockFn>
    const firstEq = (updateReturn.eq as MockFn).mock.calls[0]
    expect(firstEq[0]).toBe('id')
    expect(firstEq[1]).toBe(BOOKING_ID)
    const firstEqReturn = (updateReturn.eq as MockFn).mock.results[0].value as Record<string, MockFn>
    const secondEq = (firstEqReturn.eq as MockFn).mock.calls[0]
    expect(secondEq[0]).toBe('status')
    expect(secondEq[1]).toBe('pending_payment')
    const secondEqReturn = (firstEqReturn.eq as MockFn).mock.results[0].value as Record<string, MockFn>
    const isCall = (secondEqReturn.is as MockFn).mock.calls[0]
    expect(isCall[0]).toBe('deleted_at')
    expect(isCall[1]).toBeNull()
  })

  it('soft-deletes the provisional guest profile of the released booking', async () => {
    const { profileChain } = setupCanceledMocks()
    await callPost('{}')

    const updateArg = (profileChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.deleted_at).toBeTruthy()

    const updateReturn = (profileChain.update as MockFn).mock.results[0].value as Record<string, MockFn>
    const firstEq = (updateReturn.eq as MockFn).mock.calls[0]
    expect(firstEq[0]).toBe('id')
    expect(firstEq[1]).toBe('prov-user-1')
    const firstEqReturn = (updateReturn.eq as MockFn).mock.results[0].value as Record<string, MockFn>
    const secondEq = (firstEqReturn.eq as MockFn).mock.calls[0]
    expect(secondEq[0]).toBe('is_provisional')
    expect(secondEq[1]).toBe(true)
  })

  it('idempotent no-op when the booking is not releasable (already released/confirmed)', async () => {
    const { mockFrom, profileChain } = setupCanceledMocks([])
    const res = await callPost('{}')
    expect(res.status).toBe(200)
    // Profile must NOT be touched when nothing was released.
    expect(profileChain.update).not.toHaveBeenCalled()
    expect((mockFrom as MockFn).mock.calls.length).toBe(2)
  })

  it('never downgrades a succeeded payment_intents audit row', async () => {
    const { piChain } = setupCanceledMocks()
    await callPost('{}')

    const piUpdateArg = (piChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(piUpdateArg.status).toBe('failed')
    expect(piUpdateArg.stripe_status).toBe('canceled')

    const updateReturn = (piChain.update as MockFn).mock.results[0].value as Record<string, MockFn>
    const eqReturn = (updateReturn.eq as MockFn).mock.results[0].value as Record<string, MockFn>
    const neqCall = (eqReturn.neq as MockFn).mock.calls[0]
    expect(neqCall[0]).toBe('status')
    expect(neqCall[1]).toBe('succeeded')
  })

  it('enrolment intent: audit mark only (failed while pending), no booking release', async () => {
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        neq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })
    const enrolChain: Record<string, MockFn> = {}
    enrolChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)
      .mockReturnValueOnce(enrolChain)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    const event = makeStripeEvent(
      'payment_intent.canceled',
      makeCanceledIntent({ enrolment_id: 'enrolment-uuid-001' }),
    )
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const res = await callPost('{}')
    expect(res.status).toBe(200)

    const enrolArg = (enrolChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(enrolArg.payment_status).toBe('failed')
    // Exactly 2 from() calls — enrolments hold no slot, nothing else touched.
    expect((mockFrom as MockFn).mock.calls.length).toBe(2)
  })

  it('no booking_id metadata → audit update only, returns 200', async () => {
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        neq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })
    const mockFrom = jest.fn().mockReturnValueOnce(piChain)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    const event = makeStripeEvent('payment_intent.canceled', makeCanceledIntent({}))
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const res = await callPost('{}')
    expect(res.status).toBe(200)
    expect((mockFrom as MockFn).mock.calls.length).toBe(1)
  })
})

// ── succeeded-after-release backstop (BUG-13b) ────────────────────────────────

describe('POST /api/webhooks/stripe — succeeded-after-release backstop (BUG-13b)', () => {
  const RELEASED_ROW = {
    id: BOOKING_ID,
    status: 'pending_payment',
    deleted_at: '2026-07-05T09:00:00.000Z',
    cancellation_reason: 'expired_pending_payment',
    booked_by_user_id: 'prov-user-1',
    booking_reference: 'CRK-2026-TEST01',
  }

  const RESTORED_ROW = {
    id: BOOKING_ID,
    booking_reference: 'CRK-2026-TEST01',
    coach_profile_id: 'coach-uuid-1',
    session_date: '2026-07-20',
    session_start_time: '10:00:00',
    session_end_time: '11:00:00',
    session_type: 'individual',
  }

  /**
   * from() sequence when the confirm UPDATE matches zero rows and the row is
   * release-marked:
   *   1. payment_intents — audit update
   *   2. bookings        — confirm update → zero rows
   *   3. bookings        — backstop lookup (maybeSingle)
   *   4. bookings        — restore update → eq → eq → not → select
   *   5. user_profiles   — provisional restore → eq → eq  (on restore success)
   */
  function setupBackstopMocks(opts: {
    lookupRow?: unknown
    restoreResult?: { data: unknown; error: unknown }
  } = {}) {
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })

    const confirmChain: Record<string, MockFn> = {}
    confirmChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const lookupChain = makeChain({ data: opts.lookupRow ?? RELEASED_ROW })

    const restoreChain: Record<string, MockFn> = {}
    restoreChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          not: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue(
              opts.restoreResult ?? { data: [RESTORED_ROW], error: null },
            ),
          }),
        }),
      }),
    })

    const profileChain: Record<string, MockFn> = {}
    profileChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })
    // BUG-15: on the conflict path the 5th from() call is the payment_alerts
    // insert instead of the profile restore — the chain serves both.
    profileChain.insert = jest.fn().mockResolvedValue({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)
      .mockReturnValueOnce(confirmChain)
      .mockReturnValueOnce(lookupChain)
      .mockReturnValueOnce(restoreChain)
      .mockReturnValueOnce(profileChain)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom))

    const event = makeStripeEvent('payment_intent.succeeded', makeSucceededIntent())
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    return { mockFrom, restoreChain, profileChain }
  }

  it('restores a released row when the slot is still free (undelete + confirm)', async () => {
    const { restoreChain, profileChain } = setupBackstopMocks()
    const res = await callPost('{"type":"payment_intent.succeeded"}')
    expect(res.status).toBe(200)

    const restoreArg = (restoreChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(restoreArg.deleted_at).toBeNull()
    expect(restoreArg.cancelled_at).toBeNull()
    expect(restoreArg.cancellation_reason).toBeNull()
    expect(restoreArg.status).toBe('confirmed')
    expect(restoreArg.messaging_unlocked).toBe(true)

    // The provisional profile comes back too.
    const profileArg = (profileChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(profileArg.deleted_at).toBeNull()
  })

  it('logs MANUAL REFUND NEEDED when restore hits 23505 (slot re-booked)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { profileChain } = setupBackstopMocks({
        restoreResult: { data: null, error: { code: '23505', message: 'duplicate key' } },
      })
      const res = await callPost('{}')
      expect(res.status).toBe(200)

      const manualRefundLogged = errorSpy.mock.calls.some(
        (args) => typeof args[0] === 'string' && args[0].includes('MANUAL REFUND NEEDED'),
      )
      expect(manualRefundLogged).toBe(true)
      // No restore happened — the profile is never touched.
      expect(profileChain.update).not.toHaveBeenCalled()
      // BUG-15: durable restore_conflict alert + ops email; the confirmation
      // email is suppressed (a parent with no slot must not get "booked!").
      expect(profileChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'restore_conflict', booking_id: BOOKING_ID }),
      )
      expect(sendOpsAlert).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'restore_conflict' }),
      )
      expect(sendBookingConfirmation).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('does NOT restore a soft-deleted row that is not release-marked (guest-route rollback)', async () => {
    const { mockFrom, restoreChain } = setupBackstopMocks({
      lookupRow: { ...RELEASED_ROW, cancellation_reason: null },
    })
    const res = await callPost('{}')
    expect(res.status).toBe(200)
    expect(restoreChain.update).not.toHaveBeenCalled()
    // pi update + confirm + lookup only.
    expect((mockFrom as MockFn).mock.calls.length).toBe(3)
  })
})

// ── Camp slot capacity + email slot lines (BUG-23) ────────────────────────────
//
// Camp enrolments confirm capacity PER SLOT via confirm_camp_slot_spots()
// (never increment_programme_spots — current_spots stays 0, ruling 3), and
// the confirmation email lists the exact slots bought, built from the
// junction rows (the paid truth).

const CAMP_SESSION_ID_WH = '22222222-2222-4222-8222-222222222201'

function setupCampEnrolmentMocks(options: {
  rpcResult?: { confirmed: boolean; spot_claimed: boolean }
} = {}) {
  const { rpcResult = { confirmed: true, spot_claimed: true } } = options

  const piChain: Record<string, MockFn> = {}
  piChain.update = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ data: null, error: null }),
  })

  // BUG-15: the flip + camp slot claim happen atomically inside
  // confirm_programme_enrolment; the webhook then READS the enrolment back
  // for the email.
  const enrolmentChain: Record<string, MockFn> = {}
  for (const m of ['select', 'eq']) enrolmentChain[m] = jest.fn(() => enrolmentChain)
  enrolmentChain.maybeSingle = jest.fn().mockResolvedValue({
    data: { ...CONFIRMED_ENROLMENT, payment_model: 'per_session', sessions_paid_for: 2 },
    error: null,
  })

  const programmeChain: Record<string, MockFn> = {}
  for (const m of ['select', 'eq']) programmeChain[m] = jest.fn(() => programmeChain)
  programmeChain.maybeSingle = jest.fn().mockResolvedValue({
    data: { ...PROGRAMME_ROW_WH, camp_mode: true },
    error: null,
  })

  // Junction rows: the full day — slot 0 and slot 1 of one session.
  const junctionChain: Record<string, MockFn> = {}
  for (const m of ['select']) junctionChain[m] = jest.fn(() => junctionChain)
  junctionChain.eq = jest.fn().mockResolvedValue({
    data: [
      { group_programme_session_id: CAMP_SESSION_ID_WH, slot_index: 0 },
      { group_programme_session_id: CAMP_SESSION_ID_WH, slot_index: 1 },
    ],
    error: null,
  })

  const sessionsChain: Record<string, MockFn> = {}
  for (const m of ['select']) sessionsChain[m] = jest.fn(() => sessionsChain)
  sessionsChain.in = jest.fn().mockResolvedValue({
    data: [
      {
        id: CAMP_SESSION_ID_WH,
        session_date: '2026-08-04',
        start_time: '09:00:00',
        end_time: '12:00:00',
        slots: [
          { startTime: '09:00', endTime: '12:00' },
          { startTime: '13:00', endTime: '17:00' },
        ],
      },
    ],
    error: null,
  })

  const coachChain: Record<string, MockFn> = {}
  for (const m of ['select', 'eq']) coachChain[m] = jest.fn(() => coachChain)
  coachChain.maybeSingle = jest.fn().mockResolvedValue({
    data: { display_name: 'Coach Davies', user_profile_id: null },
    error: null,
  })

  const mockFrom = jest.fn()
    .mockReturnValueOnce(piChain)          // 1. payment_intents
    .mockReturnValueOnce(enrolmentChain)   // 2. group_programme_enrolments read-back
    .mockReturnValueOnce(programmeChain)   // 3. group_programmes
    .mockReturnValueOnce(junctionChain)    // 4. group_programme_enrolment_sessions
    .mockReturnValueOnce(sessionsChain)    // 5. group_programme_sessions
    .mockReturnValueOnce(coachChain)       // 6. coach_profiles

  const mockRpc = jest.fn().mockResolvedValue({ data: rpcResult, error: null })
  ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom, mockRpc))

  const intent = makeEnrolmentSucceededIntent()
  const event = makeStripeEvent('payment_intent.succeeded', intent)
  const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
  ;(getStripe as MockFn).mockReturnValue(stripeMock)

  return { mockFrom, mockRpc, intent }
}

describe('POST /api/webhooks/stripe — camp slot capacity (BUG-23/BUG-15)', () => {
  it('camps go through the same atomic confirm_programme_enrolment (claim lives in the DB)', async () => {
    const { mockRpc } = setupCampEnrolmentMocks()
    const res = await callPost('{}')
    expect(res.status).toBe(200)

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc.mock.calls[0][0]).toBe('confirm_programme_enrolment')
    const calledFns = mockRpc.mock.calls.map((c) => c[0])
    expect(calledFns).not.toContain('confirm_camp_slot_spots')
    expect(calledFns).not.toContain('increment_programme_spots')
  })

  it('camp over-capacity: MANUAL REFUND log + ops alert, email SUPPRESSED, still 200', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      setupCampEnrolmentMocks({ rpcResult: { confirmed: true, spot_claimed: false } })
      const res = await callPost('{}')
      expect(res.status).toBe(200) // never retry-loop Stripe on a permanent outcome

      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(logged).toContain('MANUAL REFUND NEEDED')
      expect(sendProgrammeConfirmation).not.toHaveBeenCalled()
      expect(sendOpsAlert).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'needs_refund' }),
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('email carries slot-level session lines built from the junction rows', async () => {
    setupCampEnrolmentMocks()
    await callPost('{}')

    const emailArg = (sendProgrammeConfirmation as jest.Mock).mock.calls[0][0] as {
      sessionLines?: string[]
    }
    expect(emailArg.sessionLines).toEqual([
      'Tue 4 Aug — Morning (9:00am – 12:00pm)',
      'Tue 4 Aug — Afternoon (1:00pm – 5:00pm)',
    ])
  })

  it('non-camp enrolments use the same RPC and carry no session lines', async () => {
    const { mockRpc } = setupEnrolmentMocks()
    await callPost('{}')

    expect(mockRpc).toHaveBeenCalledWith('confirm_programme_enrolment', expect.objectContaining({
      p_enrolment_id: ENROLMENT_ID,
    }))
    const emailArg = (sendProgrammeConfirmation as jest.Mock).mock.calls[0][0] as {
      sessionLines?: string[]
    }
    expect(emailArg.sessionLines).toBeUndefined()
  })
})

// ── BUG-15: event ledger + retryable/permanent split ──────────────────────────
//
// The ledger (stripe_webhook_events) runs BEFORE any handler: replays 200
// immediately with zero handler work; a ledger DB failure 500s before any
// side effect; repeated failures poison-bound at 8 attempts with a durable
// webhook_poisoned alert.

describe('POST /api/webhooks/stripe — event ledger (BUG-15)', () => {
  function setupLedgerScenario(ledgerChain: ReturnType<typeof makeLedgerChain>) {
    // A from() that throws if any handler runs — these tests assert the
    // ledger short-circuits before any business logic.
    const mockFrom = jest.fn(() => {
      throw new Error('handler must not run')
    })
    const admin = adminMock(mockFrom, jest.fn(), ledgerChain)
    ;(createAdminClient as MockFn).mockReturnValue(admin)

    const event = makeStripeEvent('payment_intent.succeeded', makeSucceededIntent())
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    return { mockFrom, admin }
  }

  it('replay: a processed event returns 200 without running any handler', async () => {
    // insert → 23505 conflict; read-back → processed.
    const ledger = makeLedgerChain()
    ledger.insert = jest.fn(() => {
      const chain: Record<string, unknown> = {
        then: (resolve: (v: unknown) => void) => resolve({ error: { code: '23505', message: 'dup' } }),
      }
      return chain
    })
    ledger.single = jest.fn().mockResolvedValue({
      data: { status: 'processed', attempts: 1, updated_at: new Date().toISOString() },
      error: null,
    })

    const { mockFrom } = setupLedgerScenario(ledger)
    const res = await callPost('{}')
    expect(res.status).toBe(200)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('in-flight: a fresh processing row returns 200 without running any handler', async () => {
    const ledger = makeLedgerChain()
    ledger.insert = jest.fn(() => ({
      then: (resolve: (v: unknown) => void) => resolve({ error: { code: '23505', message: 'dup' } }),
    }))
    ledger.single = jest.fn().mockResolvedValue({
      data: { status: 'processing', attempts: 1, updated_at: new Date().toISOString() },
      error: null,
    })

    const { mockFrom } = setupLedgerScenario(ledger)
    const res = await callPost('{}')
    expect(res.status).toBe(200)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('ledger insert failure → 500 with ZERO side effects (safest failure in the file)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const ledger = makeLedgerChain({ error: { code: 'XX000', message: 'db down' } })
      const { mockFrom } = setupLedgerScenario(ledger)
      const res = await callPost('{}')
      expect(res.status).toBe(500)
      expect(mockFrom).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('a failed event redelivered → handler runs again (retry admitted)', async () => {
    const ledger = makeLedgerChain()
    ledger.insert = jest.fn(() => ({
      then: (resolve: (v: unknown) => void) => resolve({ error: { code: '23505', message: 'dup' } }),
    }))
    ledger.single = jest.fn().mockResolvedValue({
      data: { status: 'failed', attempts: 2, updated_at: new Date(Date.now() - 60_000).toISOString() },
      error: null,
    })

    // This time the handler SHOULD run: give it working booking mocks.
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const bookingChain: Record<string, MockFn> = {}
    bookingChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })
    const lookupChain = makeChain({
      data: { id: BOOKING_ID, status: 'confirmed', deleted_at: null, cancellation_reason: null, booked_by_user_id: 'u1', booking_reference: 'R' },
    })
    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(lookupChain)
    ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom, jest.fn(), ledger))

    const event = makeStripeEvent('payment_intent.succeeded', makeSucceededIntent())
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const res = await callPost('{}')
    expect(res.status).toBe(200)
    expect(mockFrom).toHaveBeenCalled() // handler genuinely ran
  })

  it('poison bound: attempts cap → webhook_poisoned alert, 200, handler never runs', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const ledger = makeLedgerChain()
      ledger.insert = jest.fn((arg: Record<string, unknown>) => {
        // First insert call is the ledger row (conflicts); a later insert on
        // the SAME intercepted chain is the payment_alerts row — resolve ok
        // and record it for the assertion below.
        if (arg && (arg as { kind?: string }).kind === 'webhook_poisoned') {
          return { then: (resolve: (v: unknown) => void) => resolve({ error: null }) }
        }
        return { then: (resolve: (v: unknown) => void) => resolve({ error: { code: '23505', message: 'dup' } }) }
      })
      ledger.single = jest.fn().mockResolvedValue({
        data: { status: 'failed', attempts: 7, updated_at: new Date(Date.now() - 3600_000).toISOString() },
        error: null,
      })

      // payment_alerts insert goes through from('payment_alerts') — NOT the
      // ledger table — so the interceptor routes it to the inner mock:
      const alertChain: Record<string, MockFn> = {}
      alertChain.insert = jest.fn().mockResolvedValue({ data: null, error: null })
      const mockFrom = jest.fn().mockReturnValue(alertChain)
      ;(createAdminClient as MockFn).mockReturnValue(adminMock(mockFrom, jest.fn(), ledger))

      const event = makeStripeEvent('payment_intent.succeeded', makeSucceededIntent())
      const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
      ;(getStripe as MockFn).mockReturnValue(stripeMock)

      const res = await callPost('{}')
      expect(res.status).toBe(200)
      expect(alertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'webhook_poisoned' }),
      )
      expect(sendOpsAlert).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'webhook_poisoned' }),
      )
      // Only the alert insert ran — no business handler.
      expect((mockFrom as MockFn).mock.calls.every((c) => c[0] === 'payment_alerts')).toBe(true)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('ruling 3: an ops-alert email failure never affects the response', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      ;(sendOpsAlert as jest.Mock).mockRejectedValueOnce(new Error('resend down'))
      setupEnrolmentMocks({ rpcResult: { confirmed: true, spot_claimed: false } })
      const res = await callPost('{}')
      expect(res.status).toBe(200)
    } finally {
      errorSpy.mockRestore()
    }
  })
})
