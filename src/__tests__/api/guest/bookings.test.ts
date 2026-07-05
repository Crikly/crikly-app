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
//   - BUG-19 Phase 1 / BUG-21: the requested slot must be one the public
//     calendar would render (template membership, blocked dates, advance
//     windows, programme sessions, existing bookings) — specific 409s BEFORE
//     any provisional user, booking row, or Stripe PaymentIntent is created.

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

// BUG-09: the availability_templates lookup awaits the query builder directly
// (no .single()/.maybeSingle() terminal), so the chain must be thenable and
// resolve to { data, error }. `data` is the array of matching template rows.
function makeListChain(defaults: { data?: unknown; error?: unknown } = {}) {
  const result = { data: defaults.data ?? [], error: defaults.error ?? null }
  const chain: Record<string, MockFn> & { then?: unknown } = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'not', 'or', 'order', 'limit', 'gte', 'lte']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

// An availability block (09:00–12:00) carrying a per-block override. The mock
// ignores the day_of_week/sport filters, so the JS window-contains logic is what
// these rows exercise: VALID_BODY.startTime '10:00' falls inside 09:00–12:00.
function templateRow(over: Record<string, unknown> = {}) {
  return { start_time: '09:00:00', end_time: '12:00:00', price_override_pence: 7500, ...over }
}

// ── BUG-19 Phase 1 fixtures — slot validation ─────────────────────────────────
//
// The route now validates the requested slot against real availability, so the
// fixture date must be genuinely bookable at test runtime: N days ahead (inside
// COACH_ROW.max_advance_days, clear of min_advance_hours), with a recurring
// membership template on that date's weekday. Dynamic — never a hardcoded date
// that silently slides into the past.

function futureDateISO(daysAhead: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

const BOOKING_DATE = futureDateISO(21)
const BOOKING_DOW = weekdayOf(BOOKING_DATE)

// The 3c membership read: a recurring 09:00–12:00 block on the booking's
// weekday. With a 60-min session this generates slots 09:00 / 10:00 / 11:00 —
// VALID_BODY.startTime '10:00' is bookable.
const MEMBERSHIP_TEMPLATE = {
  day_of_week: BOOKING_DOW,
  start_time: '09:00:00',
  end_time: '12:00:00',
  is_recurring: true,
  specific_date: null,
}

// The reads the 3c validation block performs after the price check, in route
// order: availability_templates (membership) → blocked_dates → then
// getCoachCommitments with sources ['programme','booking'] reads
// group_programmes, group_programme_sessions (only when programmes is
// non-empty), and bookings. Its availability_templates read is skipped by the
// sources filter.
function makeValidationChains(over: {
  membership?: unknown[]
  blocked?: unknown[]
  programmes?: unknown[]
  sessions?: unknown[]
  bookings?: unknown[]
} = {}) {
  const programmes = over.programmes ?? []
  const chains = [
    makeListChain({ data: over.membership ?? [MEMBERSHIP_TEMPLATE] }), // availability_templates (3c membership)
    makeListChain({ data: over.blocked ?? [] }),                       // blocked_dates
    makeListChain({ data: programmes }),                               // group_programmes (commitments)
  ]
  if (programmes.length > 0) {
    chains.push(makeListChain({ data: over.sessions ?? [] }))          // group_programme_sessions (commitments)
  }
  chains.push(makeListChain({ data: over.bookings ?? [] }))            // bookings (commitments busy read)
  return chains
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
  coachId: '11111111-1111-4111-8111-111111111111',
  sportId: '22222222-2222-4222-8222-222222222222',
  sessionType: 'individual',
  date: BOOKING_DATE,
  startTime: '10:00',
  pricePence: 6000,
  participantName: 'Yuwin',
  participantAge: 10,
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
  id: '11111111-1111-4111-8111-111111111111',
  cancellation_window_hours: 24,
  // BUG-19 Phase 1: the slot validation reads the coach's advance window.
  // 90 days comfortably contains BOOKING_DATE (21 days out); 12 hours never
  // filters a 3-week-ahead slot.
  min_advance_hours: 12,
  max_advance_days: 90,
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
  //   1. payment_intents        — idempotency check → no existing row
  //   2. coach_profiles         — coach lookup → returns COACH_ROW
  //   3. coach_sports           — sport lookup → returns COACH_SPORT_ROW
  //   4. availability_templates — BUG-09 override lookup (individual only) → []
  //   5. availability_templates — 3c slot-validation membership (BUG-19 Ph 1)
  //   6. blocked_dates          — 3c
  //   7. group_programmes       — 3c (getCoachCommitments) → [] (no sessions read)
  //   8. bookings               — 3c (getCoachCommitments busy read) → []
  //   9. platform_config        — commission rate → returns PLATFORM_CONFIG_ROW
  //  10. user_profiles          — insert provisional user → returns PROFILE_ROW
  //  11. bookings               — insert booking → returns BOOKING_ROW
  //  12. payment_intents        — insert PI audit row → no error
  //
  // The default BUG-09 availability_templates result is empty, so canonicalPrice
  // falls back to the sport default — keeping the £60 happy-path figures intact.

  const piIdempotentChain = makeChain({ data: null, error: null })
  const coachChain = makeChain({ data: COACH_ROW, error: null })
  const sportChain = makeChain({ data: COACH_SPORT_ROW, error: null })
  const availTemplatesChain = makeListChain({ data: [], error: null })
  const configChain = makeChain({ data: PLATFORM_CONFIG_ROW, error: null })
  const profileChain = makeChain({ data: PROFILE_ROW, error: null })
  const bookingChain = makeChain({ data: BOOKING_ROW, error: null })
  const piInsertChain = makeChain({ data: null, error: null })

  const mockFrom = jest.fn()
    .mockReturnValueOnce(piIdempotentChain)   // 1. payment_intents (idempotency)
    .mockReturnValueOnce(coachChain)          // 2. coach_profiles
    .mockReturnValueOnce(sportChain)          // 3. coach_sports
    .mockReturnValueOnce(availTemplatesChain) // 4. availability_templates (BUG-09)
  for (const c of makeValidationChains()) mockFrom.mockReturnValueOnce(c) // 5–8
  mockFrom
    .mockReturnValueOnce(configChain)         // 9. platform_config
    .mockReturnValueOnce(profileChain)        // 10. user_profiles insert
    .mockReturnValueOnce(bookingChain)        // 11. bookings insert
    .mockReturnValueOnce(piInsertChain)       // 12. payment_intents insert

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

    // The 12th from() call is the payment_intents insert (0-indexed = 11) —
    // shifted by BUG-09 (index 3) and the four BUG-19 validation reads (4–7).
    const piInsertChain = (mockFrom as MockFn).mock.results[11].value as Record<string, MockFn>
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

    const piInsertChain = (mockFrom as MockFn).mock.results[11].value as Record<string, MockFn>
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
    const sportChain = makeChain({ data: COACH_SPORT_ROW }) // sport default = 6000
    const availTemplatesChain = makeListChain({ data: [] }) // no override → 6000
    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(availTemplatesChain)
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
    const availTemplatesChain = makeListChain({ data: [] })
    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(availTemplatesChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    await callPost({ ...VALID_BODY, pricePence: 1 })

    // Only 4 from() calls (idempotency + coach + sport + availability_templates) —
    // the BUG-09 override lookup precedes the price check; no writes after.
    expect((mockFrom as MockFn).mock.calls.length).toBe(4)
    // Stripe should never be called
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled()
  })
})

// ── BUG-09: per-block price override ──────────────────────────────────────────
//
// A coach can override the price for an availability block (e.g. £75 Sunday
// mornings vs a £60 sport default). The canonical price — and the anti-tamper
// check — must honour that override for INDIVIDUAL sessions, matching the block
// whose window contains the start time. Group sessions never consult overrides.

describe('POST /api/guest/bookings — BUG-09 per-block price override', () => {
  // Individual happy-path mocks with a configurable availability_templates result.
  function setupIndividual(availData: unknown[]) {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW })
    const availTemplatesChain = makeListChain({ data: availData })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    const bookingChain = makeChain({ data: BOOKING_ROW })
    const piInsertChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(availTemplatesChain) // BUG-09 override lookup
    for (const c of makeValidationChains()) mockFrom.mockReturnValueOnce(c) // BUG-19 3c reads
    mockFrom
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(piInsertChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    return { mockFrom, stripeMock, bookingChain }
  }

  it('charges the overridden block price when a block window contains the start time', async () => {
    const { bookingChain, stripeMock } = setupIndividual([templateRow()]) // 09:00–12:00 @ £75

    // The guest saw and sent £75 (7500); 10:00 falls inside the 09:00–12:00 block.
    const res = await callPost({ ...VALID_BODY, pricePence: 7500 })
    expect(res.status).toBe(200)

    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, number>
    expect(insertArg.coach_price_pence).toBe(7500)   // override, not the 6000 default
    expect(insertArg.commission_pence).toBe(750)     // 10% of 7500
    expect(insertArg.parent_total_pence).toBe(8250)  // 7500 + 750 (BR-01)
    const piCreateArg = (stripeMock.paymentIntents.create as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(piCreateArg.amount).toBe(8250)            // Stripe charged the overridden total
  })

  it('rejects a client price that ignores the block override (anti-tamper)', async () => {
    setupIndividual([templateRow()]) // canonical becomes 7500

    // A stale page sends the £60 sport default; server canonical is £75 → 409.
    const res = await callPost({ ...VALID_BODY, pricePence: 6000 })
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('price_mismatch')
  })

  it('falls back to the sport default when no block window contains the start time', async () => {
    // A block exists but covers 14:00–16:00, so the 10:00 booking matches nothing.
    const { bookingChain } = setupIndividual([templateRow({ start_time: '14:00:00', end_time: '16:00:00' })])

    const res = await callPost({ ...VALID_BODY, pricePence: 6000 }) // sport default
    expect(res.status).toBe(200)
    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, number>
    expect(insertArg.coach_price_pence).toBe(6000)
  })

  it('falls back to the sport default when the matching block has a null override', async () => {
    const { bookingChain } = setupIndividual([templateRow({ price_override_pence: null })])

    const res = await callPost({ ...VALID_BODY, pricePence: 6000 })
    expect(res.status).toBe(200)
    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, number>
    expect(insertArg.coach_price_pence).toBe(6000)
  })

  it('returns 500 when the availability_templates lookup itself errors', async () => {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW })
    const availTemplatesChain = makeListChain({ data: null, error: { message: 'db error' } })
    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(availTemplatesChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(500)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('internal_error')
    // The error short-circuits before any write or Stripe call.
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled()
  })

  it('ignores block price overrides for group sessions (override is individual-only)', async () => {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    // No BUG-09 override chain is provided — a group booking must skip that
    // lookup. The 3c slot-validation membership read (BUG-19 Phase 1) still
    // consults availability_templates for EVERY session type, so exactly one
    // availability_templates from() call is expected; its row carries a 7500
    // override which must NOT affect the group price.
    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW }) // group default = 4000
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    const bookingChain = makeChain({ data: BOOKING_ROW })
    const piInsertChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
    for (const c of makeValidationChains({
      membership: [{ ...MEMBERSHIP_TEMPLATE, price_override_pence: 7500 }],
    })) {
      mockFrom.mockReturnValueOnce(c)
    }
    mockFrom
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(piInsertChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost({ ...VALID_BODY, sessionType: 'group', pricePence: 4000 })
    expect(res.status).toBe(200)

    const fromArgs = (mockFrom as MockFn).mock.calls.map((c) => c[0])
    const templateReads = fromArgs.filter((a) => a === 'availability_templates')
    expect(templateReads).toHaveLength(1) // 3c membership only — no BUG-09 read
    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, number>
    expect(insertArg.coach_price_pence).toBe(4000) // group default, override ignored
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
    const availTemplatesChain = makeListChain({ data: [] })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    // Booking insert simulates PG unique_violation — the 3c validation read saw
    // no conflicting booking (race window), so the 034 index is the backstop.
    const bookingChain = makeChain({ data: null, error: { code: '23505', message: 'duplicate key' } })
    // Soft-delete of provisional user (called after slot_taken)
    const profileUpdateChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(availTemplatesChain)
    for (const c of makeValidationChains()) mockFrom.mockReturnValueOnce(c)
    mockFrom
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
    const availTemplatesChain = makeListChain({ data: [] })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    const bookingChain = makeChain({ data: null, error: { code: '23505', message: 'duplicate key' } })
    const profileUpdateChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(availTemplatesChain)
    for (const c of makeValidationChains()) mockFrom.mockReturnValueOnce(c)
    mockFrom
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(profileUpdateChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    await callPost(VALID_BODY)

    // The 12th from() call (index 11) should be the profile soft-delete update —
    // shifted by BUG-09 (index 3) and the four BUG-19 validation reads (4–7).
    const updateChain = (mockFrom as MockFn).mock.results[11].value as Record<string, MockFn>
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

  it('returns 400 when sportId is not a UUID (blocks PostgREST .or() filter injection)', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
    // A comma-bearing payload that would otherwise smuggle a second sport_id
    // clause into the BUG-09 availability_templates .or() filter.
    const injection = `${VALID_BODY.sportId},sport_id.eq.33333333-3333-4333-8333-333333333333`
    const res = await callPost({ ...VALID_BODY, sportId: injection })
    expect(res.status).toBe(400)
  })

  it('returns 400 when coachId is not a UUID', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
    const res = await callPost({ ...VALID_BODY, coachId: 'not-a-uuid' })
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

// ── UX-16 participant name/age ────────────────────────────────────────────────

describe('POST /api/guest/bookings — UX-16 participant', () => {
  it('returns 400 when participantName is missing', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
    const { participantName: _dropped, ...withoutName } = VALID_BODY
    const res = await callPost(withoutName)
    expect(res.status).toBe(400)
  })

  it('returns 400 when participantName is whitespace only', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
    const res = await callPost({ ...VALID_BODY, participantName: '   ' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when participantName exceeds 100 characters', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
    const res = await callPost({ ...VALID_BODY, participantName: 'x'.repeat(101) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when participantAge is a float', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
    const res = await callPost({ ...VALID_BODY, participantAge: 10.5 })
    expect(res.status).toBe(400)
  })

  it('returns 400 when participantAge is out of range', async () => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
    expect((await callPost({ ...VALID_BODY, participantAge: 0 })).status).toBe(400)
    expect((await callPost({ ...VALID_BODY, participantAge: 100 })).status).toBe(400)
  })

  it('accepts a booking with no participantAge (adult player)', async () => {
    setupHappyPath()
    const res = await callPost({ ...VALID_BODY, participantAge: null })
    expect(res.status).toBe(200)
  })

  it('persists participant_name and participant_age on the booking insert', async () => {
    const { bookingChain } = setupHappyPath()
    await callPost(VALID_BODY)
    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.participant_name).toBe('Yuwin')
    expect(insertArg.participant_age).toBe(10)
  })

  it('trims participant_name before persisting', async () => {
    const { bookingChain } = setupHappyPath()
    await callPost({ ...VALID_BODY, participantName: '  Yuwin  ' })
    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.participant_name).toBe('Yuwin')
  })

  it('stashes participant_name and participant_age (as a string) in PI metadata', async () => {
    const { stripeMock } = setupHappyPath()
    await callPost(VALID_BODY)
    const createArgs = (stripeMock.paymentIntents.create as MockFn).mock.calls[0][0] as {
      metadata: Record<string, string>
    }
    expect(createArgs.metadata.participant_name).toBe('Yuwin')
    expect(createArgs.metadata.participant_age).toBe('10')
  })

  it('omits participant_age from PI metadata when no age was given', async () => {
    const { stripeMock } = setupHappyPath()
    await callPost({ ...VALID_BODY, participantAge: null })
    const createArgs = (stripeMock.paymentIntents.create as MockFn).mock.calls[0][0] as {
      metadata: Record<string, string>
    }
    expect(createArgs.metadata.participant_name).toBe('Yuwin')
    expect('participant_age' in createArgs.metadata).toBe(false)
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

  // ── BUG-13b: prior attempt released/cancelled → replay must NOT dead-end ──
  //
  // A released booking's intent is cancelled and can never be confirmed, so
  // replaying its client_secret would strand the guest. The route must fall
  // through to a fresh booking AND burn the token-based idempotency key
  // (Stripe would replay the cancelled intent; unique_idempotency_key would
  // reject the audit row) in favour of per-booking keys.

  function setupBurnedReplay(
    existingBookingRow: Record<string, unknown>,
    retrieveResult?: Record<string, unknown>,
  ) {
    const stripeMock = makeStripeMock()
    if (retrieveResult) {
      stripeMock.paymentIntents.retrieve.mockResolvedValue(retrieveResult)
    }
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({
      data: { stripe_payment_intent_id: 'pi_old', booking_id: 'booking-old-uuid' },
    })
    const bookingLookupChain = makeChain({ data: existingBookingRow })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW })
    const availTemplatesChain = makeListChain({ data: [] })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    const bookingInsertChain = makeChain({ data: BOOKING_ROW })
    const piInsertChain = makeChain({ data: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)   // 1. payment_intents (idempotency)
      .mockReturnValueOnce(bookingLookupChain)  // 2. bookings (replay status lookup)
      .mockReturnValueOnce(coachChain)          // 3. coach_profiles
      .mockReturnValueOnce(sportChain)          // 4. coach_sports
      .mockReturnValueOnce(availTemplatesChain) // 5. availability_templates (BUG-09)
    for (const c of makeValidationChains()) mockFrom.mockReturnValueOnce(c) // 6–9
    mockFrom
      .mockReturnValueOnce(configChain)         // 10. platform_config
      .mockReturnValueOnce(profileChain)        // 11. user_profiles insert
      .mockReturnValueOnce(bookingInsertChain)  // 12. bookings insert
      .mockReturnValueOnce(piInsertChain)       // 13. payment_intents insert
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    return { stripeMock, bookingInsertChain, piInsertChain }
  }

  it('BUG-13b: released (soft-deleted) prior booking → fresh booking with per-booking keys', async () => {
    const { stripeMock, bookingInsertChain, piInsertChain } = setupBurnedReplay({
      booking_reference: 'CRK-2026-OLDREF',
      status: 'pending_payment',
      deleted_at: '2026-07-05T10:00:00.000Z',
    })

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data.bookingId).toBe(BOOKING_ROW.id)
    expect(data.bookingReference).not.toBe('CRK-2026-OLDREF')

    // The released intent must never be replayed to the client.
    expect(stripeMock.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(bookingInsertChain.insert).toHaveBeenCalled()

    // Burned token key: Stripe + DB keys are per-booking, not token-based.
    const createOpts = stripeMock.paymentIntents.create.mock.calls[0][1] as Record<string, unknown>
    expect(createOpts.idempotencyKey).toBe(`guest-booking-${BOOKING_ROW.id}`)
    const piInsertArg = (piInsertChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(piInsertArg.idempotency_key).toBe(`guest-booking-${BOOKING_ROW.id}`)
  })

  it('BUG-13b: PI retrieve fails (status unknown) → fresh booking with burned keys, never a key reuse', async () => {
    const { stripeMock, bookingInsertChain } = setupBurnedReplay({
      booking_reference: 'CRK-2026-OLDREF',
      status: 'pending_payment',
      deleted_at: null,
    })
    stripeMock.paymentIntents.retrieve.mockRejectedValue(new Error('Stripe unavailable'))
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const res = await callPost(VALID_BODY)
      expect(res.status).toBe(200)
      expect(bookingInsertChain.insert).toHaveBeenCalled()

      // Unknown intent status → the token key must be burned, not reused with
      // the new booking's metadata (Stripe idempotency mismatch → 502).
      const createOpts = stripeMock.paymentIntents.create.mock.calls[0][1] as Record<string, unknown>
      expect(createOpts.idempotencyKey).toBe(`guest-booking-${BOOKING_ROW.id}`)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('BUG-13b: live booking but CANCELLED intent (webhook lag) → fresh booking, burned keys', async () => {
    const { stripeMock, bookingInsertChain } = setupBurnedReplay(
      { booking_reference: 'CRK-2026-OLDREF', status: 'pending_payment', deleted_at: null },
      { id: 'pi_old', client_secret: 'pi_old_secret', status: 'canceled' },
    )

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>

    // The cancelled intent's secret must not be returned.
    expect(data.clientSecret).not.toBe('pi_old_secret')
    expect(bookingInsertChain.insert).toHaveBeenCalled()

    const createOpts = stripeMock.paymentIntents.create.mock.calls[0][1] as Record<string, unknown>
    expect(createOpts.idempotencyKey).toBe(`guest-booking-${BOOKING_ROW.id}`)
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
    const availTemplatesChain = makeListChain({ data: [] })
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
      .mockReturnValueOnce(availTemplatesChain)
    for (const c of makeValidationChains()) mockFrom.mockReturnValueOnce(c)
    mockFrom
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
    const availTemplatesChain = makeListChain({ data: [] })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    const bookingChain = makeChain({ data: BOOKING_ROW })
    const bookingDeleteChain = makeChain({ data: null, error: null })
    const profileDeleteChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(sportChain)
      .mockReturnValueOnce(availTemplatesChain)
    for (const c of makeValidationChains()) mockFrom.mockReturnValueOnce(c)
    mockFrom
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(bookingDeleteChain)
      .mockReturnValueOnce(profileDeleteChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    await callPost(VALID_BODY)

    // Shifted by BUG-09 (index 3) and the four BUG-19 validation reads (4–7):
    // index 11 = booking soft-delete, index 12 = profile soft-delete.
    const bookingUpdate = (mockFrom as MockFn).mock.results[11].value as Record<string, MockFn>
    expect(bookingUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
    const profileUpdate = (mockFrom as MockFn).mock.results[12].value as Record<string, MockFn>
    expect(profileUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
  })
})

// ── BUG-19 Phase 1 / BUG-21: slot validation rejection matrix ─────────────────
//
// The route must reject a crafted POST for any time the public calendar would
// not offer — with a SPECIFIC 409 and with zero writes and zero Stripe calls.
// Every rejection fires before the provisional user, the booking row, and the
// PaymentIntent are created.

describe('POST /api/guest/bookings — BUG-19/BUG-21 slot validation', () => {
  // Mocks the reads up to and including the 3c validation block. Rejection paths
  // return inside 3c, so no config/profile/booking chains are queued — a leak
  // past validation would throw on an undefined chain and fail the test loudly.
  function setupRejection(over: Parameters<typeof makeValidationChains>[0] = {}, coachRow = COACH_ROW) {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const mockFrom = jest.fn()
      .mockReturnValueOnce(makeChain({ data: null }))       // payment_intents (idempotency)
      .mockReturnValueOnce(makeChain({ data: coachRow }))   // coach_profiles
      .mockReturnValueOnce(makeChain({ data: COACH_SPORT_ROW })) // coach_sports
      .mockReturnValueOnce(makeListChain({ data: [] }))     // availability_templates (BUG-09)
    for (const c of makeValidationChains(over)) mockFrom.mockReturnValueOnce(c)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    return { mockFrom, stripeMock }
  }

  function expectNoMoneyObjects(mockFrom: MockFn, stripeMock: ReturnType<typeof makeStripeMock>) {
    const fromArgs = mockFrom.mock.calls.map((c) => c[0] as string)
    expect(fromArgs).not.toContain('user_profiles')  // no provisional user
    expect(fromArgs).not.toContain('platform_config') // rejected before step 4
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled()
  }

  it('409 slot_not_available when the time is outside every availability block', async () => {
    // Membership block is 09:00–12:00; 13:00 is outside it.
    const { mockFrom, stripeMock } = setupRejection()
    const res = await callPost({ ...VALID_BODY, startTime: '13:00' })
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('slot_not_available')
    expectNoMoneyObjects(mockFrom, stripeMock)
  })

  it('409 slot_not_available when the coach has no availability blocks at all', async () => {
    const { mockFrom, stripeMock } = setupRejection({ membership: [] })
    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('slot_not_available')
    expectNoMoneyObjects(mockFrom, stripeMock)
  })

  it('409 date_blocked when the date is a blocked single day', async () => {
    const { mockFrom, stripeMock } = setupRejection({
      blocked: [{ blocked_date: BOOKING_DATE, blocked_date_end: null }],
    })
    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('date_blocked')
    expectNoMoneyObjects(mockFrom, stripeMock)
  })

  it('409 date_blocked when the date falls inside a blocked range', async () => {
    const { mockFrom, stripeMock } = setupRejection({
      blocked: [{ blocked_date: futureDateISO(20), blocked_date_end: futureDateISO(22) }],
    })
    const res = await callPost(VALID_BODY) // BOOKING_DATE is 21 days out
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('date_blocked')
    expectNoMoneyObjects(mockFrom, stripeMock)
  })

  it('409 outside_booking_window when the date is beyond the coach max-advance horizon', async () => {
    // BOOKING_DATE is 21 days out; this coach only accepts 7 days ahead.
    const { mockFrom, stripeMock } = setupRejection({}, { ...COACH_ROW, max_advance_days: 7 })
    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('outside_booking_window')
    expectNoMoneyObjects(mockFrom, stripeMock)
  })

  it('409 outside_booking_window when the date is in the past', async () => {
    const pastDate = futureDateISO(-1)
    const { mockFrom, stripeMock } = setupRejection({
      membership: [{ ...MEMBERSHIP_TEMPLATE, day_of_week: weekdayOf(pastDate) }],
    })
    const res = await callPost({ ...VALID_BODY, date: pastDate })
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('outside_booking_window')
    expectNoMoneyObjects(mockFrom, stripeMock)
  })

  it('409 slot_taken when the slot overlaps a persisted programme session', async () => {
    const { mockFrom, stripeMock } = setupRejection({
      programmes: [{
        id: 'prog-1', day_of_week: BOOKING_DOW, days_of_week: null,
        start_time: '10:00', duration_minutes: 60, starts_at: null, ends_at: null,
      }],
      sessions: [{
        group_programme_id: 'prog-1', session_date: BOOKING_DATE,
        start_time: '10:00:00', end_time: '11:00:00',
      }],
    })
    const res = await callPost(VALID_BODY) // 10:00–11:00 collides head-on
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('slot_taken')
    expect(data.reason).toContain('a programme session')
    expectNoMoneyObjects(mockFrom, stripeMock)
  })

  it('409 slot_taken when the slot overlaps a legacy recurring programme with no session rows', async () => {
    const { mockFrom, stripeMock } = setupRejection({
      programmes: [{
        id: 'prog-1', day_of_week: BOOKING_DOW, days_of_week: null,
        start_time: '09:30', duration_minutes: 90, starts_at: null, ends_at: null,
      }],
      sessions: [], // no persisted rows → recurring fallback places 09:30–11:00
    })
    const res = await callPost(VALID_BODY) // 10:00–11:00 overlaps the pattern
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('slot_taken')
    expect(data.reason).toContain('a programme session')
    expectNoMoneyObjects(mockFrom, stripeMock)
  })

  it('409 slot_not_available (not a phantom slot_taken) when the time is outside every block AND overlaps a commitment', async () => {
    // 13:00 was never inside the 09:00–12:00 availability block; a programme
    // session also runs 13:00–14:00. The honest reason is "no such slot", not
    // "slot taken" — a conflict can only consume a slot that was offered.
    const { mockFrom, stripeMock } = setupRejection({
      programmes: [{
        id: 'prog-1', day_of_week: BOOKING_DOW, days_of_week: null,
        start_time: '13:00', duration_minutes: 60, starts_at: null, ends_at: null,
      }],
      sessions: [{
        group_programme_id: 'prog-1', session_date: BOOKING_DATE,
        start_time: '13:00:00', end_time: '14:00:00',
      }],
    })
    const res = await callPost({ ...VALID_BODY, startTime: '13:00' })
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('slot_not_available')
    expectNoMoneyObjects(mockFrom, stripeMock)
  })

  it('409 slot_taken when an existing booking overlaps with an UNEQUAL start time (the 034 index gap)', async () => {
    // 09:30–10:30 vs the requested 10:00–11:00: different start_time, so the
    // migration-034 unique index would NOT fire — interval validation must.
    const { mockFrom, stripeMock } = setupRejection({
      bookings: [{ session_start_time: '09:30:00', session_end_time: '10:30:00' }],
    })
    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('slot_taken')
    expect(data.reason).toContain('a confirmed booking')
    expectNoMoneyObjects(mockFrom, stripeMock)
  })

  it('accepts a slot from an ad-hoc (one-off) block on its specific date', async () => {
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const bookingChain = makeChain({ data: BOOKING_ROW })
    const mockFrom = jest.fn()
      .mockReturnValueOnce(makeChain({ data: null }))
      .mockReturnValueOnce(makeChain({ data: COACH_ROW }))
      .mockReturnValueOnce(makeChain({ data: COACH_SPORT_ROW }))
      .mockReturnValueOnce(makeListChain({ data: [] })) // BUG-09
    // The only availability is an ad-hoc block ON the booking date whose
    // day_of_week deliberately does NOT match — membership must come from
    // specific_date, not the weekday.
    for (const c of makeValidationChains({
      membership: [{
        day_of_week: (BOOKING_DOW + 1) % 7,
        start_time: '09:00:00',
        end_time: '12:00:00',
        is_recurring: false,
        specific_date: BOOKING_DATE,
      }],
    })) {
      mockFrom.mockReturnValueOnce(c)
    }
    mockFrom
      .mockReturnValueOnce(makeChain({ data: PLATFORM_CONFIG_ROW }))
      .mockReturnValueOnce(makeChain({ data: PROFILE_ROW }))
      .mockReturnValueOnce(bookingChain)
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(200)
  })
})
