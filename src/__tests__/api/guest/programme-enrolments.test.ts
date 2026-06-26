// Integration tests for POST /api/guest/programme-enrolments
// (src/app/api/guest/programme-enrolments/route.ts)
//
// All external dependencies mocked:
//   - @/lib/supabase/admin → createAdminClient
//   - @/lib/stripe/client  → getStripe
//
// Business rules covered:
//   BR-01  Commission added ON TOP of coach price; parent_total = coach_amount + commission.
//          commission_pence = round(coach_amount × rate)
//   BR-10  All amounts are integer pence; currency code always present.
//   BR-06  Enrolment created with payment_status='pending' (confirmed by webhook).
//   BR-12  enrolment_reference matches CRK-YYYY-XXXXXX format.
//
// Security rules covered (docs/06_SECURITY_COMPLIANCE.md):
//   - Invalid body → 400 (missing fields, empty selectedSessionIds for per_session,
//     invalid email, invalid paymentType).
//   - payment_type_mismatch (client paymentType ≠ programme.payment_type) → 400.
//   - programme_unavailable (not active / wrong coach / not found) → 404.
//   - coach_unavailable (not live / paused / suspended / not found) → 404.
//   - invalid_sessions (requested id not in programme, past, or wrong status) → 409.
//   - spots_taken (current_spots >= max_spots) → 409.
//   - commission NaN guard → 500 with internal_error.
//   - Idempotency: same idempotencyToken returns existing enrolment + PI.
//   - Stripe failure → enrolment soft-failed + provisional user soft-deleted.
//   - payment_intents row keyed on enrolment_id (not booking_id).

// ── Module mocks (must appear before any imports) ─────────────────────────────

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import { POST } from '@/app/api/guest/programme-enrolments/route'

// ── Types ─────────────────────────────────────────────────────────────────────

type MockFn = jest.Mock

// ── Supabase chain builder ────────────────────────────────────────────────────
//
// Mirrors the pattern used in src/__tests__/api/guest/bookings.test.ts.

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
  const cs = overrides.clientSecret ?? 'pi_test_secret_enrol'
  const id = overrides.intentId ?? 'pi_test_enrol_001'
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

const COACH_ID = 'coach-uuid-001'
const PROGRAMME_ID = 'programme-uuid-001'
const SESSION_ID_1 = 'session-uuid-001'
const SESSION_ID_2 = 'session-uuid-002'

const VALID_GUEST = {
  fullName: 'Sarah Test',
  email: 'sarah@example.com',
  phone: '07700 900000',
  address: '10 Downing Street',
  townCity: 'London',
  postcode: 'SW1A 2AA',
}

const VALID_BODY_PER_SESSION = {
  coachId: COACH_ID,
  programmeId: PROGRAMME_ID,
  paymentType: 'per_session',
  selectedSessionIds: [SESSION_ID_1],
  idempotencyToken: 'idem-enrol-abc',
  guest: VALID_GUEST,
}

const VALID_BODY_BLOCK = {
  coachId: COACH_ID,
  programmeId: PROGRAMME_ID,
  paymentType: 'block_upfront',
  selectedSessionIds: [],
  idempotencyToken: 'idem-enrol-block',
  guest: VALID_GUEST,
}

const COACH_ROW = {
  id: COACH_ID,
  is_profile_live: true,
  is_paused: false,
  is_suspended: false,
  deleted_at: null,
}

// per_session programme — price_per_session_pence = 2800p (£28), no block price
const PROGRAMME_ROW_PER_SESSION = {
  id: PROGRAMME_ID,
  coach_profile_id: COACH_ID,
  payment_type: 'per_session',
  price_per_session_pence: 2800,
  block_price_pence: null,
  block_session_count: null,
  max_spots: 10,
  current_spots: 3,
  currency: 'GBP',
  status: 'active',
  deleted_at: null,
}

// block_upfront programme — block_price_pence = 22400p (£224), 8 sessions
const PROGRAMME_ROW_BLOCK = {
  id: PROGRAMME_ID,
  coach_profile_id: COACH_ID,
  payment_type: 'block_upfront',
  price_per_session_pence: null,
  block_price_pence: 22400,
  block_session_count: 8,
  max_spots: 10,
  current_spots: 3,
  currency: 'GBP',
  status: 'active',
  deleted_at: null,
}

const PLATFORM_CONFIG_ROW = { default_commission_rate: 0.10 }

const SESSION_ROW_1 = { id: SESSION_ID_1, session_date: '2099-07-05', status: 'scheduled' }
const SESSION_ROW_2 = { id: SESSION_ID_2, session_date: '2099-07-12', status: 'scheduled' }

const PROFILE_ROW = { id: 'profile-uuid-001' }
const ENROLMENT_ROW = { id: 'enrolment-uuid-001' }

// ── Helper — build a request ──────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/guest/programme-enrolments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function callPost(body: unknown) {
  return POST(makeRequest(body) as Parameters<typeof POST>[0])
}

// ── Mock setup helpers ────────────────────────────────────────────────────────

/**
 * Happy-path for a per_session enrolment (one session selected).
 *
 * Supabase from() call sequence (mirrors the route order):
 *  1. payment_intents   — idempotency check → no existing row
 *  2. coach_profiles    — coach lookup → COACH_ROW
 *  3. group_programmes  — programme lookup → PROGRAMME_ROW_PER_SESSION
 *  4. group_programme_sessions — session validation → [SESSION_ROW_1]
 *  5. platform_config   — commission rate → PLATFORM_CONFIG_ROW
 *  6. user_profiles     — provisional user insert → PROFILE_ROW
 *  7. group_programme_enrolments — enrolment insert → ENROLMENT_ROW
 *  8. group_programme_enrolment_sessions — junction insert → success
 *  9. payment_intents   — audit row insert → success
 */
function setupHappyPathPerSession() {
  const stripeMock = makeStripeMock()
  ;(getStripe as MockFn).mockReturnValue(stripeMock)

  const piIdempotentChain = makeChain({ data: null, error: null })
  const coachChain = makeChain({ data: COACH_ROW, error: null })
  const programmeChain = makeChain({ data: PROGRAMME_ROW_PER_SESSION, error: null })
  // sessions lookup returns an array — use the chain's select path differently:
  // the route calls .select().eq().in() then awaits directly (no .single())
  const sessionsChain: Record<string, MockFn> = {}
  for (const m of ['select', 'eq', 'in']) {
    sessionsChain[m] = jest.fn(() => sessionsChain)
  }
  // The route awaits the result of the final chained call directly
  sessionsChain.in = jest.fn().mockResolvedValue({ data: [SESSION_ROW_1], error: null })

  const configChain = makeChain({ data: PLATFORM_CONFIG_ROW, error: null })
  const profileChain = makeChain({ data: PROFILE_ROW, error: null })
  const enrolmentChain = makeChain({ data: ENROLMENT_ROW, error: null })
  const junctionChain: Record<string, MockFn> = {}
  junctionChain.insert = jest.fn().mockResolvedValue({ data: null, error: null })

  const piInsertChain = makeChain({ data: null, error: null })

  const mockFrom = jest.fn()
    .mockReturnValueOnce(piIdempotentChain)   // 1. payment_intents idempotency
    .mockReturnValueOnce(coachChain)           // 2. coach_profiles
    .mockReturnValueOnce(programmeChain)       // 3. group_programmes
    .mockReturnValueOnce(sessionsChain)        // 4. group_programme_sessions
    .mockReturnValueOnce(configChain)          // 5. platform_config
    .mockReturnValueOnce(profileChain)         // 6. user_profiles insert
    .mockReturnValueOnce(enrolmentChain)       // 7. group_programme_enrolments insert
    .mockReturnValueOnce(junctionChain)        // 8. group_programme_enrolment_sessions insert
    .mockReturnValueOnce(piInsertChain)        // 9. payment_intents audit insert

  ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

  return { mockFrom, stripeMock, profileChain, enrolmentChain, junctionChain, piInsertChain }
}

/**
 * Happy-path for a block_upfront enrolment.
 *
 * Supabase from() call sequence (no sessions junction for block):
 *  1. payment_intents  — idempotency
 *  2. coach_profiles
 *  3. group_programmes
 *  4. platform_config
 *  5. user_profiles insert
 *  6. group_programme_enrolments insert
 *  7. payment_intents audit insert
 */
function setupHappyPathBlock() {
  const stripeMock = makeStripeMock({ clientSecret: 'pi_block_secret', intentId: 'pi_block_001' })
  ;(getStripe as MockFn).mockReturnValue(stripeMock)

  const piIdempotentChain = makeChain({ data: null, error: null })
  const coachChain = makeChain({ data: COACH_ROW, error: null })
  const programmeChain = makeChain({ data: PROGRAMME_ROW_BLOCK, error: null })
  const configChain = makeChain({ data: PLATFORM_CONFIG_ROW, error: null })
  const profileChain = makeChain({ data: PROFILE_ROW, error: null })
  const enrolmentChain = makeChain({ data: ENROLMENT_ROW, error: null })
  const piInsertChain = makeChain({ data: null, error: null })

  const mockFrom = jest.fn()
    .mockReturnValueOnce(piIdempotentChain)
    .mockReturnValueOnce(coachChain)
    .mockReturnValueOnce(programmeChain)
    .mockReturnValueOnce(configChain)
    .mockReturnValueOnce(profileChain)
    .mockReturnValueOnce(enrolmentChain)
    .mockReturnValueOnce(piInsertChain)

  ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

  return { mockFrom, stripeMock, profileChain, enrolmentChain, piInsertChain }
}

// ── Env setup ─────────────────────────────────────────────────────────────────

process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_placeholder'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-placeholder'

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Happy path — per_session ──────────────────────────────────────────────────

describe('POST /api/guest/programme-enrolments — happy path (per_session)', () => {
  it('returns 200 with clientSecret, enrolmentReference, and enrolmentId', async () => {
    setupHappyPathPerSession()
    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(typeof data.clientSecret).toBe('string')
    expect(typeof data.enrolmentReference).toBe('string')
    expect(typeof data.enrolmentId).toBe('string')
  })

  it('enrolmentReference matches CRK-YYYY-XXXXXX format (BR-12)', async () => {
    setupHappyPathPerSession()
    const res = await callPost(VALID_BODY_PER_SESSION)
    const data = await res.json() as Record<string, unknown>
    expect(data.enrolmentReference).toMatch(/^CRK-\d{4}-[A-Z0-9]{6}$/)
  })

  it('BR-01: enrolment inserted with commission ON TOP — parent_total = coach_amount + commission', async () => {
    const { enrolmentChain } = setupHappyPathPerSession()
    await callPost(VALID_BODY_PER_SESSION)

    const insertArg = (enrolmentChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    const coachAmount = insertArg.coach_amount_pence as number
    const commission = insertArg.commission_pence as number
    const parentTotal = insertArg.parent_total_pence as number

    // 1 × 2800p = 2800p coach. 10% = 280p commission. 3080p parent total.
    expect(coachAmount).toBe(2800)
    expect(commission).toBe(280)
    expect(parentTotal).toBe(3080)
    expect(parentTotal).toBe(coachAmount + commission)
    // Coach amount is LESS than parent total — commission is ON TOP
    expect(parentTotal).toBeGreaterThan(coachAmount)
  })

  it('BR-10: all pence values in enrolment insert are integers', async () => {
    const { enrolmentChain } = setupHappyPathPerSession()
    await callPost(VALID_BODY_PER_SESSION)

    const insertArg = (enrolmentChain.insert as MockFn).mock.calls[0][0] as Record<string, number>
    expect(Number.isInteger(insertArg.coach_amount_pence)).toBe(true)
    expect(Number.isInteger(insertArg.commission_pence)).toBe(true)
    expect(Number.isInteger(insertArg.parent_total_pence)).toBe(true)
  })

  it('BR-06: enrolment inserted with payment_status=pending (webhook confirms later)', async () => {
    const { enrolmentChain } = setupHappyPathPerSession()
    await callPost(VALID_BODY_PER_SESSION)

    const insertArg = (enrolmentChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.payment_status).toBe('pending')
  })

  it('provisional user inserted with is_provisional=true and auth_user_id=null', async () => {
    const { profileChain } = setupHappyPathPerSession()
    await callPost(VALID_BODY_PER_SESSION)

    const insertArg = (profileChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.is_provisional).toBe(true)
    expect(insertArg.auth_user_id).toBeNull()
  })

  it('payment_intents audit row keyed on enrolment_id (not booking_id)', async () => {
    const { mockFrom } = setupHappyPathPerSession()
    await callPost(VALID_BODY_PER_SESSION)

    // 9th from() call (index 8) = payment_intents audit insert
    const piInsertChain = (mockFrom as MockFn).mock.results[8].value as Record<string, MockFn>
    const piInsertArg = (piInsertChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(typeof piInsertArg.enrolment_id).toBe('string')
    expect(piInsertArg.enrolment_id).not.toBe(null)
    // booking_id must be absent or null — the XOR CHECK in migration 033 enforces this
    expect(piInsertArg.booking_id === undefined || piInsertArg.booking_id === null).toBe(true)
  })

  it('BR-01: payment_intents audit row has application_fee_pence = commission', async () => {
    const { mockFrom } = setupHappyPathPerSession()
    await callPost(VALID_BODY_PER_SESSION)

    const piInsertChain = (mockFrom as MockFn).mock.results[8].value as Record<string, MockFn>
    const piInsertArg = (piInsertChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(piInsertArg.application_fee_pence).toBe(280) // 10% of 2800p
    expect(piInsertArg.coach_transfer_amount_pence).toBe(2800)
  })

  it('BR-01: Stripe is charged the parent total (coach + commission)', async () => {
    const { stripeMock } = setupHappyPathPerSession()
    await callPost(VALID_BODY_PER_SESSION)

    const piCreateArg = (stripeMock.paymentIntents.create as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(piCreateArg.amount).toBe(3080) // 2800 + 280
  })

  it('BR-10: currency code present on payment_intents audit row', async () => {
    const { mockFrom } = setupHappyPathPerSession()
    await callPost(VALID_BODY_PER_SESSION)

    const piInsertChain = (mockFrom as MockFn).mock.results[8].value as Record<string, MockFn>
    const piInsertArg = (piInsertChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(typeof piInsertArg.currency).toBe('string')
    expect((piInsertArg.currency as string).length).toBeGreaterThan(0)
  })

  it('junction table insert includes the correct session id', async () => {
    const { junctionChain } = setupHappyPathPerSession()
    await callPost(VALID_BODY_PER_SESSION)

    const junctionArg = (junctionChain.insert as MockFn).mock.calls[0][0] as Array<Record<string, unknown>>
    expect(Array.isArray(junctionArg)).toBe(true)
    expect(junctionArg.length).toBe(1)
    expect(junctionArg[0].group_programme_session_id).toBe(SESSION_ID_1)
  })
})

// ── Happy path — block_upfront ────────────────────────────────────────────────

describe('POST /api/guest/programme-enrolments — happy path (block_upfront)', () => {
  it('returns 200 with clientSecret and enrolmentReference', async () => {
    setupHappyPathBlock()
    const res = await callPost(VALID_BODY_BLOCK)
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(typeof data.clientSecret).toBe('string')
    expect(typeof data.enrolmentReference).toBe('string')
  })

  it('BR-01: block enrolment — parent total = block_price + 10% commission (22400p + 2240p = 24640p)', async () => {
    const { enrolmentChain } = setupHappyPathBlock()
    await callPost(VALID_BODY_BLOCK)

    const insertArg = (enrolmentChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.coach_amount_pence).toBe(22400)
    expect(insertArg.commission_pence).toBe(2240)
    expect(insertArg.parent_total_pence).toBe(24640)
  })

  it('block_amount_pence is set for block_upfront enrolments', async () => {
    const { enrolmentChain } = setupHappyPathBlock()
    await callPost(VALID_BODY_BLOCK)

    const insertArg = (enrolmentChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.block_amount_pence).toBe(22400)
    expect(insertArg.payment_model).toBe('block')
  })

  it('no junction table insert occurs for block_upfront', async () => {
    const { mockFrom } = setupHappyPathBlock()
    await callPost(VALID_BODY_BLOCK)

    // block path: 7 from() calls total (no sessions junction = 8th absent)
    expect((mockFrom as MockFn).mock.calls.length).toBe(7)
  })
})

// ── Input validation ───────────────────────────────────────────────────────────

describe('POST /api/guest/programme-enrolments — invalid body', () => {
  beforeEach(() => {
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())
  })

  it('returns 400 when body is not JSON', async () => {
    const req = new Request('http://localhost/api/guest/programme-enrolments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{',
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
  })

  it('returns 400 when coachId is missing', async () => {
    const { coachId: _omit, ...noCoachId } = VALID_BODY_PER_SESSION
    const res = await callPost(noCoachId)
    expect(res.status).toBe(400)
  })

  it('returns 400 when programmeId is missing', async () => {
    const { programmeId: _omit, ...noProgrammeId } = VALID_BODY_PER_SESSION
    const res = await callPost(noProgrammeId)
    expect(res.status).toBe(400)
  })

  it('returns 400 when paymentType is invalid', async () => {
    const res = await callPost({ ...VALID_BODY_PER_SESSION, paymentType: 'monthly' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when paymentType is per_session but selectedSessionIds is empty', async () => {
    const res = await callPost({ ...VALID_BODY_PER_SESSION, selectedSessionIds: [] })
    expect(res.status).toBe(400)
  })

  it('returns 400 when email is invalid', async () => {
    const res = await callPost({
      ...VALID_BODY_PER_SESSION,
      guest: { ...VALID_GUEST, email: 'not-an-email' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when fullName is missing', async () => {
    const res = await callPost({
      ...VALID_BODY_PER_SESSION,
      guest: { ...VALID_GUEST, fullName: '' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 error code invalid_body for malformed input', async () => {
    const res = await callPost({ coachId: '' })
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('invalid_body')
  })
})

// ── payment_type_mismatch ─────────────────────────────────────────────────────

describe('POST /api/guest/programme-enrolments — payment_type_mismatch', () => {
  it('returns 400 payment_type_mismatch when client sends per_session but programme is block_upfront', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    // Programme is configured as block_upfront
    const programmeChain = makeChain({ data: PROGRAMME_ROW_BLOCK })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    // Client sends per_session
    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('payment_type_mismatch')
  })
})

// ── programme_unavailable ─────────────────────────────────────────────────────

describe('POST /api/guest/programme-enrolments — programme_unavailable', () => {
  it('returns 404 when programme status is not active', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const programmeChain = makeChain({ data: { ...PROGRAMME_ROW_PER_SESSION, status: 'draft' } })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(404)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('programme_unavailable')
  })

  it('returns 404 when programme belongs to a different coach', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const programmeChain = makeChain({
      data: { ...PROGRAMME_ROW_PER_SESSION, coach_profile_id: 'different-coach-uuid' },
    })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(404)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('programme_unavailable')
  })

  it('returns 404 when programme row is null (not found)', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const programmeChain = makeChain({ data: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(404)
  })
})

// ── coach_unavailable ─────────────────────────────────────────────────────────

describe('POST /api/guest/programme-enrolments — coach_unavailable', () => {
  it('returns 404 when coach is_profile_live=false', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: { ...COACH_ROW, is_profile_live: false } })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(404)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('coach_unavailable')
  })

  it('returns 404 when coach row is null (not found)', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(404)
  })
})

// ── invalid_sessions ──────────────────────────────────────────────────────────

describe('POST /api/guest/programme-enrolments — invalid_sessions', () => {
  it('returns 409 invalid_sessions when a requested session id is not in this programme', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const programmeChain = makeChain({ data: PROGRAMME_ROW_PER_SESSION })
    // Sessions query returns empty (the requested session doesn't belong to this programme)
    const sessionsChain: Record<string, MockFn> = {}
    sessionsChain.select = jest.fn(() => sessionsChain)
    sessionsChain.eq = jest.fn(() => sessionsChain)
    sessionsChain.in = jest.fn().mockResolvedValue({ data: [], error: null })

    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
      .mockReturnValueOnce(sessionsChain)
      .mockReturnValueOnce(configChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('invalid_sessions')
  })

  it('returns 409 invalid_sessions when a session is in the past', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const programmeChain = makeChain({ data: PROGRAMME_ROW_PER_SESSION })
    // Session exists but has a past date
    const pastSession = { id: SESSION_ID_1, session_date: '2020-01-01', status: 'scheduled' }
    const sessionsChain: Record<string, MockFn> = {}
    sessionsChain.select = jest.fn(() => sessionsChain)
    sessionsChain.eq = jest.fn(() => sessionsChain)
    sessionsChain.in = jest.fn().mockResolvedValue({ data: [pastSession], error: null })

    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
      .mockReturnValueOnce(sessionsChain)
      .mockReturnValueOnce(configChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('invalid_sessions')
  })

  it('returns 409 invalid_sessions when a session status is cancelled (not scheduled)', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const programmeChain = makeChain({ data: PROGRAMME_ROW_PER_SESSION })
    // Session is cancelled
    const cancelledSession = { id: SESSION_ID_1, session_date: '2099-07-05', status: 'cancelled' }
    const sessionsChain: Record<string, MockFn> = {}
    sessionsChain.select = jest.fn(() => sessionsChain)
    sessionsChain.eq = jest.fn(() => sessionsChain)
    sessionsChain.in = jest.fn().mockResolvedValue({ data: [cancelledSession], error: null })

    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
      .mockReturnValueOnce(sessionsChain)
      .mockReturnValueOnce(configChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('invalid_sessions')
  })

  it('deduplicates selectedSessionIds before querying — duplicate ids in body count as one', async () => {
    // Body contains SESSION_ID_1 twice — route must dedupe to one id.
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const programmeChain = makeChain({ data: PROGRAMME_ROW_PER_SESSION })
    const sessionsChain: Record<string, MockFn> = {}
    sessionsChain.select = jest.fn(() => sessionsChain)
    sessionsChain.eq = jest.fn(() => sessionsChain)
    // After dedup, exactly 1 unique id → query returns 1 row → valid
    sessionsChain.in = jest.fn().mockResolvedValue({ data: [SESSION_ROW_1], error: null })

    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    const enrolmentChain = makeChain({ data: ENROLMENT_ROW })
    const junctionChain: Record<string, MockFn> = {}
    junctionChain.insert = jest.fn().mockResolvedValue({ data: null, error: null })
    const piInsertChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
      .mockReturnValueOnce(sessionsChain)
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(enrolmentChain)
      .mockReturnValueOnce(junctionChain)
      .mockReturnValueOnce(piInsertChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    // Body has SESSION_ID_1 duplicated
    const duplicateBody = {
      ...VALID_BODY_PER_SESSION,
      selectedSessionIds: [SESSION_ID_1, SESSION_ID_1],
    }
    const res = await callPost(duplicateBody)
    // Should succeed — deduplicated to one session
    expect(res.status).toBe(200)
  })
})

// ── spots_taken ────────────────────────────────────────────────────────────────

describe('POST /api/guest/programme-enrolments — spots_taken', () => {
  it('returns 409 spots_taken when current_spots >= max_spots', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    // Full programme
    const fullProgramme = { ...PROGRAMME_ROW_PER_SESSION, current_spots: 10, max_spots: 10 }
    const programmeChain = makeChain({ data: fullProgramme })
    const sessionsChain: Record<string, MockFn> = {}
    sessionsChain.select = jest.fn(() => sessionsChain)
    sessionsChain.eq = jest.fn(() => sessionsChain)
    sessionsChain.in = jest.fn().mockResolvedValue({ data: [SESSION_ROW_1], error: null })

    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
      .mockReturnValueOnce(sessionsChain)
      .mockReturnValueOnce(configChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(409)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('spots_taken')
  })
})

// ── Commission NaN guard ───────────────────────────────────────────────────────

describe('POST /api/guest/programme-enrolments — commission NaN guard', () => {
  it('returns 500 internal_error when platform_config has a non-numeric commission rate', async () => {
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const programmeChain = makeChain({ data: PROGRAMME_ROW_PER_SESSION })
    const sessionsChain: Record<string, MockFn> = {}
    sessionsChain.select = jest.fn(() => sessionsChain)
    sessionsChain.eq = jest.fn(() => sessionsChain)
    sessionsChain.in = jest.fn().mockResolvedValue({ data: [SESSION_ROW_1], error: null })
    // Corrupt commission rate from DB
    const configChain = makeChain({ data: { default_commission_rate: 'not-a-number' } })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
      .mockReturnValueOnce(sessionsChain)
      .mockReturnValueOnce(configChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(500)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('internal_error')
  })
})

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('POST /api/guest/programme-enrolments — idempotency', () => {
  it('returns 200 with existing enrolmentReference when idempotencyToken already has a PI row', async () => {
    const existingPi = {
      stripe_payment_intent_id: 'pi_existing',
      enrolment_id: 'enrolment-existing-uuid',
    }
    const existingEnrolment = { enrolment_reference: 'CRK-2026-ENROL1' }

    const stripeMock = makeStripeMock({ clientSecret: 'pi_existing_secret', intentId: 'pi_existing' })
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: existingPi })
    const enrolmentRefChain = makeChain({ data: existingEnrolment })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)   // payment_intents lookup → found
      .mockReturnValueOnce(enrolmentRefChain)   // group_programme_enrolments lookup
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data.enrolmentReference).toBe('CRK-2026-ENROL1')
    expect(data.clientSecret).toBe('pi_existing_secret')
  })

  it('does NOT create a new enrolment row on idempotent replay', async () => {
    const existingPi = {
      stripe_payment_intent_id: 'pi_existing',
      enrolment_id: 'enrolment-existing-uuid',
    }
    const existingEnrolment = { enrolment_reference: 'CRK-2026-ENROL1' }

    const stripeMock = makeStripeMock({ clientSecret: 'pi_existing_secret' })
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: existingPi })
    const enrolmentRefChain = makeChain({ data: existingEnrolment })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(enrolmentRefChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    await callPost(VALID_BODY_PER_SESSION)

    // Only 2 from() calls — no new profile, enrolment, or PI created
    expect((mockFrom as MockFn).mock.calls.length).toBe(2)
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled()
  })
})

// ── Stripe failure + rollback ─────────────────────────────────────────────────

describe('POST /api/guest/programme-enrolments — Stripe failure', () => {
  it('returns 502 payment_init_failed when Stripe throws', async () => {
    const stripeMock = makeStripeMock()
    ;(stripeMock.paymentIntents.create as MockFn).mockRejectedValue(new Error('Stripe error'))
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const programmeChain = makeChain({ data: PROGRAMME_ROW_PER_SESSION })
    const sessionsChain: Record<string, MockFn> = {}
    sessionsChain.select = jest.fn(() => sessionsChain)
    sessionsChain.eq = jest.fn(() => sessionsChain)
    sessionsChain.in = jest.fn().mockResolvedValue({ data: [SESSION_ROW_1], error: null })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    const enrolmentChain = makeChain({ data: ENROLMENT_ROW })
    const junctionChain: Record<string, MockFn> = {}
    junctionChain.insert = jest.fn().mockResolvedValue({ data: null, error: null })
    // Rollback chains: enrolment soft-fail + profile soft-delete
    const enrolmentDeleteChain = makeChain({ data: null, error: null })
    const profileDeleteChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
      .mockReturnValueOnce(sessionsChain)
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(enrolmentChain)
      .mockReturnValueOnce(junctionChain)
      .mockReturnValueOnce(enrolmentDeleteChain)  // enrolment soft-fail
      .mockReturnValueOnce(profileDeleteChain)    // profile soft-delete
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(VALID_BODY_PER_SESSION)
    expect(res.status).toBe(502)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('payment_init_failed')
  })

  it('soft-fails enrolment and soft-deletes provisional user on Stripe failure (rollback)', async () => {
    const stripeMock = makeStripeMock()
    ;(stripeMock.paymentIntents.create as MockFn).mockRejectedValue(new Error('Stripe error'))
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const piIdempotentChain = makeChain({ data: null })
    const coachChain = makeChain({ data: COACH_ROW })
    const programmeChain = makeChain({ data: PROGRAMME_ROW_PER_SESSION })
    const sessionsChain: Record<string, MockFn> = {}
    sessionsChain.select = jest.fn(() => sessionsChain)
    sessionsChain.eq = jest.fn(() => sessionsChain)
    sessionsChain.in = jest.fn().mockResolvedValue({ data: [SESSION_ROW_1], error: null })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const profileChain = makeChain({ data: PROFILE_ROW })
    const enrolmentChain = makeChain({ data: ENROLMENT_ROW })
    const junctionChain: Record<string, MockFn> = {}
    junctionChain.insert = jest.fn().mockResolvedValue({ data: null, error: null })
    const enrolmentDeleteChain = makeChain({ data: null, error: null })
    const profileDeleteChain = makeChain({ data: null, error: null })

    const mockFrom = jest.fn()
      .mockReturnValueOnce(piIdempotentChain)
      .mockReturnValueOnce(coachChain)
      .mockReturnValueOnce(programmeChain)
      .mockReturnValueOnce(sessionsChain)
      .mockReturnValueOnce(configChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(enrolmentChain)
      .mockReturnValueOnce(junctionChain)
      .mockReturnValueOnce(enrolmentDeleteChain)
      .mockReturnValueOnce(profileDeleteChain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    await callPost(VALID_BODY_PER_SESSION)

    // Index 8 = enrolment update (soft-fail), index 9 = profile update (soft-delete)
    const enrolmentUpdate = (mockFrom as MockFn).mock.results[8].value as Record<string, MockFn>
    expect(enrolmentUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: 'failed', status: 'cancelled' })
    )
    const profileUpdate = (mockFrom as MockFn).mock.results[9].value as Record<string, MockFn>
    expect(profileUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
  })
})
