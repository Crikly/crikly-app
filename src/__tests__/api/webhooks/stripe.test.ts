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

import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import { sendBookingConfirmation } from '@/lib/resend/send-booking-confirmation'
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
  ;(createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn() })
  // sendBookingConfirmation is a no-op by default — tests that care about it
  // override this. Existing tests use intents without guest_email metadata so the
  // route returns before ever calling this function.
  ;(sendBookingConfirmation as jest.Mock).mockResolvedValue(true)
})

// ── Signature verification ────────────────────────────────────────────────────

describe('POST /api/webhooks/stripe — signature verification', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const stripeMock = { webhooks: { constructEvent: jest.fn() } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })

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
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })

    const res = await callPost('{"forged":"payload"}', 'bad-sig')
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('Invalid signature')
  })

  it('does NOT call any DB handler when signature verification fails', async () => {
    const mockFrom = jest.fn()
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })
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

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)      // payment_intents update
      .mockReturnValueOnce(bookingChain) // bookings update

    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

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

  it('returns 200 even when DB update throws (never causes Stripe retry loop)', async () => {
    // payment_intents update fails
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockRejectedValue(new Error('DB connection lost')),
    })

    const mockFrom = jest.fn().mockReturnValue(piChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const event = makeStripeEvent('payment_intent.succeeded', makeSucceededIntent())
    const stripeMock = { webhooks: { constructEvent: jest.fn().mockReturnValue(event) } }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const res = await callPost('{}')
    expect(res.status).toBe(200)
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
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

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
    const piChain: Record<string, MockFn> = {}
    piChain.update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: updateError }),
    })

    const mockFrom = jest.fn().mockReturnValue(piChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

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

  it('returns 200 even when payment_intents update fails (never retry loops)', async () => {
    setupFailedMocks({ message: 'DB error' })
    const res = await callPost('{}')
    expect(res.status).toBe(200)
  })
})

// ── Unknown event type ────────────────────────────────────────────────────────

describe('POST /api/webhooks/stripe — unknown event type', () => {
  it('returns 200 and does not crash for an unrecognised event type', async () => {
    const mockFrom = jest.fn()
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

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
  } = {}) {
    const {
      bookingUpdateData = [BOOKING_WITH_EMAIL],
      coachRow = { display_name: 'Coach Davies', user_profile_id: null },
      userProfileRow = null,
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

    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const intent = makeIntentWithGuestEmail()
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

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piChain)
      .mockReturnValueOnce(bookingChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

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
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

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
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

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
