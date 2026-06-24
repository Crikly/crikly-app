// Integration tests for POST /api/guest/bookings (src/app/api/guest/bookings/route.ts)
//
// All external dependencies mocked:
//   - @/lib/supabase/admin → createAdminClient
//   - @/lib/stripe/client  → getStripe
//
// Business rules covered:
//   BR-01  Commission ON TOP; application_fee_pence = commission.
//   BR-10  All amounts are integer pence; currency code present.
//   BR-06  Booking created with status='pending_payment' (confirmed by webhook).
//   BR-12  booking_reference matches CRK-YYYY-XXXXXX format.
//
// Security rules covered (docs/06_SECURITY_COMPLIANCE.md):
//   - Price tamper prevention (client pricePence !== DB canonical → 409).
//   - Slot conflict → provisional user soft-deleted before return.
//   - Stripe failure → booking + provisional user soft-deleted.
//   - Idempotency: existing payment_intents row → returns same booking/PI.

// ── Module mocks (must appear before any imports) ─────────────────────────────

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import { POST } from '@/app/api/guest/bookings/route'

// ── Types ─────────────────────────────────────────────────────────────────────

type MockFn = jest.Mock

// ── Supabase chain builder ────────────────────────────────────────────────────
//
// Mirrors the pattern used in src/__tests__/api/coaches/list.test.ts.
// Each method returns `this` so calls can be chained. Terminal methods
// (.single(), .maybeSingle()) return their own mocks for per-test control.

function makeChain(defaults: { data?: unknown; error?: unknown } = {}) {
  const chain: Record<string, MockFn> = {}
  for (const m of [
    'select', 'eq', 'neq', 'is', 'in', 'gte', 'lte', 'or',
    'order', 'limit', 'insert', 'update', 'filter',
  ]) {
    chain[m] = jest.fn(() => chain)
  }
  chain.single = jest.fn().mockResolvedValue({ data: defaults.data ?? null, error: defaults.error ?? null })
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: defaults.data ?? null, error: defaults.error ?? null })
  return chain
}

// ── Stripe mock builder ───────────────────────────────────────────────────────

function makeStripeMock(overrides: { clientSecret?: string; intentId?: string } = {}) {
  const cs = overrides.clientSecret ?? 'pi_test_secret_abc'
  const id = overrides.intentId ?? 'pi_test_abc'
  return {
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ id, client_secret: cs, status: 'requires_payment_method' }),
      retrieve: jest.fn().mockResolvedValue({ id, client_secret: cs }),
      cancel: jest.fn().mockResolvedValue({}),
    },
    webhooks: { constructEvent: jest.fn() },
  }
}

// ── Shared test fixtures ──────────────────────────────────────────────────────

const VALID_BODY = {
  coachId: 'coach-uuid-001',
  sportId: 'sport-uuid-001',
  sessionType: 'individual',
  date: '2026-08-15',
  startTime: '10:00',
  pricePence: 6000,
  idempotencyToken: 'idem-token-abc',
  guest: {
    fullName: 'Sarah Test',
    email: 'sarah@example.com',
    phone: '07700 900000',
    address: '10 Downing Street',
    townCity: 'London',
    postcode: 'SW1A 2AA',
  },
}

const COACH_ROW = {
  id: 'coach-uuid-001',
  cancellation_window_hours: 24,
  is_profile_live: true,
  is_paused: false,
  is_suspended: false,
  deleted_at: null,
}

const COACH_SPORT_ROW = {
  price_individual_pence: 6000,
  price_group_pence: 4000,
  session_duration_minutes: 60,
  currency: 'GBP',
  is_active: true,
}

const PLATFORM_CONFIG_ROW = { default_commission_rate: 0.10 }

const BOOKING_ROW = { id: 'booking-uuid-001' }

const PROFILE_ROW = { id: 'profile-uuid-001' }

// ── Helper — build a NextRequest-like Request ─────────────────────────────────

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/guest/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Helper — call the route handler ──────────────────────────────────────────

async function callPost(body: unknown) {
  return POST(makeRequest(body) as Parameters<typeof POST>[0])
}

// ── Mock setup helpers ────────────────────────────────────────────────────────

function setupHappyPath() {
  const stripeMock = makeStripeMock()
  ;(getStripe as MockFn).mockReturnValue(stripeMock)

  // Sequence of from() calls (in route order):
  //   1. payment_intents — idempotency check → no existing row
  //   2. coach_profiles  — coach lookup → returns COACH_ROW
  //   3. coach_sports    — sport lookup → returns COACH_SPORT_ROW
  //   4. platform_config — commission rate → returns PLATFORM_CONFIG_ROW
  //   5. user_profiles   — insert provisional user → returns PROFILE_ROW
  //   6. bookings        — insert booking → returns BOOKING_ROW
  //   7. payment_intents — insert PI audit row → no error

  const piIdempotentChain = makeChain({ data: null, error: null })
  const coachChain = makeChain({ data: COACH_ROW, error: null })
  const sportChain = makeChain({ data: COACH_SPORT_ROW, error: null })
  const configChain = makeChain({ data: PLATFORM_CONFIG_ROW, error: null })
  const profileChain = makeChain({ data: PROFILE_ROW, error: null })
  const bookingChain = makeChain({ data: BOOKING_ROW, error: null })
  const piInsertChain = makeChain({ data: null, error: null })

  const mockFrom = jest.fn()
    .mockReturnValueOnce(piIdempotentChain)  // 1. payment_intents (idempotency)
    .mockReturnValueOnce(coachChain)          // 2. coach_profiles
    .mockReturnValueOnce(sportChain)          // 3. coach_sports
    .mockReturnValueOnce(configChain)         // 4. platform_config
    .mockReturnValueOnce(profileChain)        // 5. user_profiles insert
    .mockReturnValueOnce(bookingChain)        // 6. bookings insert
    .mockReturnValueOnce(piInsertChain)       // 7. payment_intents insert

  ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

  return { mockFrom, stripeMock, profileChain, bookingChain }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Provide env vars once at module level so lazy inits don't throw
process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_placeholder'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-placeholder'

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Happy path ────────────────────────────────────────────────────────────────

describe('POST /api/guest/bookings — happy path', () => {
  it('returns 200 with clientSecret, bookingReference, and bookingId', async () => {
    setupHappyPath()
    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(typeof data.clientSecret).toBe('string')
    expect(typeof data.bookingReference).toBe('string')
    expect(typeof data.bookingId).toBe('string')
  })

  it('bookingReference matches BR-12 format CRK-YYYY-XXXXXX', async () => {
    setupHappyPath()
    const res = await callPost(VALID_BODY)
    const data = await res.json() as Record<string, unknown>
    expect(data.bookingReference).toMatch(/^CRK-\d{4}-[A-Z0-9]{6}$/)
  })

  it('BR-01: booking inserted with commission ON TOP — parentTotalPence = coachPrice + commission', async () => {
    const { bookingChain } = setupHappyPath()

    await callPost(VALID_BODY)

    // Find the insert call on the bookings chain
    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    const coachPrice = insertArg.coach_price_pence as number
    const commission = insertArg.commission_pence as number
    const parentTotal = insertArg.parent_total_pence as number

    expect(coachPrice).toBe(6000)
    expect(commission).toBe(600)          // 10% of 6000
    expect(parentTotal).toBe(6600)        // coach price + commission
    expect(parentTotal).toBe(coachPrice + commission)  // never deducted
  })

  it('BR-10: all pence values in booking insert are integers', async () => {
    const { bookingChain } = setupHappyPath()

    await callPost(VALID_BODY)

    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, number>
    expect(Number.isInteger(insertArg.coach_price_pence)).toBe(true)
    expect(Number.isInteger(insertArg.commission_pence)).toBe(true)
    expect(Number.isInteger(insertArg.parent_total_pence)).toBe(true)
  })

  it('booking is inserted with status=pending_payment (webhook confirms later, BR-06)', async () => {
    const { bookingChain } = setupHappyPath()

    await callPost(VALID_BODY)

    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.status).toBe('pending_payment')
  })

  it('provisional user inserted with is_provisional=true and auth_user_id=null', async () => {
    const { profileChain } = setupHappyPath()

    await callPost(VALID_BODY)

    const insertArg = (profileChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.is_provisional).toBe(true)
    expect(insertArg.auth_user_id).toBeNull()
  })

  it('payment_intents insert includes application_fee_pence = commission (BR-01)', async () => {
    const { mockFrom, stripeMock } = setupHappyPath()

    await callPost(VALID_BODY)

    // The 7th from() call is the payment_intents insert (0-indexed = 6)
    const piInsertChain = (mockFrom as MockFn).mock.results[6].value as Record<string, MockFn>
    const piInsertArg = (piInsertChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(piInsertArg.application_fee_pence).toBe(600)
    expect(piInsertArg.coach_transfer_amount_pence).toBe(6000)
    // Stripe was charged the parent total
    const piCreateArg = (stripeMock.paymentIntents.create as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(piCreateArg.amount).toBe(6600)
  })

  it('BR-10: currency code is present on payment_intents insert', async () => {
    const { mockFrom } = setupHappyPath()

    await callPost(VALID_BODY)

    const piInsertChain = (mockFrom as MockFn).mock.results[6].value as Record<string, MockFn>
    const piInsertArg = (piInsertChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(typeof piInsertArg.currency).toBe('string')
    expect((piInsertArg.currency as string).length).toBeGreaterThan(0)
  })
})

// ── Price tamper prevention ───────────────────────────────────────────────────

describe('POST /api/guest/bookings — price tamper prevention', () => {
  it('returns 409 price_mismatch when client pricePence does not match DB canonical price', async () => {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW }) // canonical = 6000
    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    // Client sends 5000, but DB says 6000
    const tamperedBody = { ...VALID_BODY, pricePence: 5000 }
    const res = await callPost(tamperedBody)

    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('price_mismatch')
  })

  it('does NOT create a booking or Stripe PI when price mismatch detected', async () => {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW })
    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    await callPost({ ...VALID_BODY, pricePence: 1 })

    // Only 3 from() calls should have happened (idempotency + coach + sport)
    expect((mockFrom as MockFn).mock.calls.length).toBe(3)
    // Stripe should never be called
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled()
  })
})

// ── Slot taken ────────────────────────────────────────────────────────────────

describe('POST /api/guest/bookings — slot taken', () => {
  it('returns 409 slot_taken when booking insert returns PG error code 23505', async () => {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    // Booking insert simulates PG unique_violation
    const bookingChain = makeChain({ data: null, error: { code: '23505', message: 'duplicate key' } })
    // Soft-delete of provisional user (called after slot_taken)
    const profileUpdateChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(profileUpdateChain)  // soft-delete rollback
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY)

    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('slot_taken')
  })

  it('soft-deletes the provisional user on slot_taken (rollback)', async () => {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    const bookingChain = makeChain({ data: null, error: { code: '23505', message: 'duplicate key' } })
    const profileUpdateChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(profileUpdateChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    await callPost(VALID_BODY)

    // The 7th from() call (index 6) should be the profile soft-delete update
    const updateChain = (mockFrom as MockFn).mock.results[6].value as Record<string, MockFn>
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
  })
})

// ── Invalid body ──────────────────────────────────────────────────────────────

describe('POST /api/guest/bookings — invalid body', () => {
  it('returns 400 when body is not JSON', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const req = new Request('http://localhost/api/guest/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{',
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
  })

  it('returns 400 when coachId is missing', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
    const { coachId: _omit, ...noCoachId } = VALID_BODY
    const res = await callPost(noCoachId)
    expect(res.status).toBe(400)
  })

  it('returns 400 when email is invalid', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
    const res = await callPost({ ...VALID_BODY, guest: { ...VALID_BODY.guest, email: 'not-an-email' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 when pricePence is a float (not an integer pence)', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
    // 60.99 is a genuine float — parseBody rejects it (Number.isInteger is false)
    const res = await callPost({ ...VALID_BODY, pricePence: 60.99 })
    expect(res.status).toBe(400)
  })

  it('returns 400 when sessionType is invalid', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
    const res = await callPost({ ...VALID_BODY, sessionType: 'private' })
    expect(res.status).toBe(400)
  })
})

// ── Coach not bookable ────────────────────────────────────────────────────────

describe('POST /api/guest/bookings — coach not bookable', () => {
  it('returns 404 when coach is_profile_live=false', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: { ...COACH_ROW, is_profile_live: false } })
    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(404)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('coach_unavailable')
  })

  it('returns 404 when coach row is not found (deleted)', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: null })  // not found
    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(404)
  })
})

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('POST /api/guest/bookings — idempotency', () => {
  it('returns 200 with existing clientSecret when idempotencyToken already has a payment_intent row', async () => {
    const existingPi = {
      stripe_payment_intent_id: 'pi_existing',
      booking_id: 'booking-existing-uuid',
    }
    const existingBooking = { booking_reference: 'CRK-2026-ABCDEF' }

    const stripeMock = makeStripeMock({ clientSecret: 'pi_existing_secret', intentId: 'pi_existing' })
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: existingPi })
    const bookingRefChain = makeChain({ data: existingBooking })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)   // payment_intents lookup → found
      .mockReturnValueOnce(bookingRefChain)      // bookings lookup for reference
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data.bookingReference).toBe('CRK-2026-ABCDEF')
    expect(data.clientSecret).toBe('pi_existing_secret')
  })

  it('does NOT create a new booking row on idempotent replay', async () => {
    const existingPi = {
      stripe_payment_intent_id: 'pi_existing',
      booking_id: 'booking-existing-uuid',
    }
    const existingBooking = { booking_reference: 'CRK-2026-ABCDEF' }

    const stripeMock = makeStripeMock({ clientSecret: 'pi_existing_secret' })
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: existingPi })
    const bookingRefChain = makeChain({ data: existingBooking })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(bookingRefChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    await callPost(VALID_BODY)

    // Only 2 from() calls — no profile insert, no booking insert, no new PI
    expect((mockFrom as MockFn).mock.calls.length).toBe(2)
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled()
  })
})

// ── Stripe failure + rollback ─────────────────────────────────────────────────

describe('POST /api/guest/bookings — Stripe failure', () => {
  it('returns 502 when Stripe paymentIntents.create throws', async () => {
    const stripeMock = makeStripeMock()
    ;(stripeMock.paymentIntents.create as MockFn).mockRejectedValue(new Error('Stripe error'))
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    const bookingChain = makeChain({ data: BOOKING_ROW })
    // Soft-delete calls for rollback: booking then profile
    const bookingDeleteChain = makeChain({ data: null, error: null })
    const profileDeleteChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(bookingDeleteChain)  // booking soft-delete
      .mockReturnValueOnce(profileDeleteChain)  // profile soft-delete
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(502)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('payment_init_failed')
  })

  it('soft-deletes both booking and provisional user when Stripe throws (rollback)', async () => {
    const stripeMock = makeStripeMock()
    ;(stripeMock.paymentIntents.create as MockFn).mockRejectedValue(new Error('Stripe error'))
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    const bookingChain = makeChain({ data: BOOKING_ROW })
    const bookingDeleteChain = makeChain({ data: null, error: null })
    const profileDeleteChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(bookingDeleteChain)
      .mockReturnValueOnce(profileDeleteChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    await callPost(VALID_BODY)

    // Index 6 = booking soft-delete, index 7 = profile soft-delete
    const bookingUpdate = (mockFrom as MockFn).mock.results[6].value as Record<string, MockFn>
    expect(bookingUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
    const profileUpdate = (mockFrom as MockFn).mock.results[7].value as Record<string, MockFn>
    expect(profileUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
  })
})
