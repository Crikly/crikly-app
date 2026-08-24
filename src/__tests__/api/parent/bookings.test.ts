// Integration tests for POST /api/parent/bookings (P-10 Phase 2).
//
// Scope: what is NEW on this route — auth gating, child-profile ownership,
// derived session type, tier pricing wiring, migration-054 storage, and the
// authed idempotency ownership guard. The shared slot-validation and
// override-pricing logic is exercised end-to-end by the guest route's suite
// (src/__tests__/api/guest/bookings.test.ts) through the same modules, so
// slot-pricing is mocked here rather than re-proven.
//
// Business rules covered: BR-01 (commission on top), BR-06 (pending_payment
// until webhook), BR-10 (integer pence), D4/D5 (tier pricing + cap).

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/stripe/client', () => ({ getStripe: jest.fn() }))
jest.mock('@/lib/auth/require-parent', () => ({ requireParentContext: jest.fn() }))
jest.mock('@/lib/booking/slot-pricing', () => ({
  resolveIndividualCanonicalPrice: jest.fn(),
  validateSlotAvailability: jest.fn(),
}))

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { requireParentContext } from '@/lib/auth/require-parent'
import {
  resolveIndividualCanonicalPrice,
  validateSlotAvailability,
} from '@/lib/booking/slot-pricing'
import { POST } from '@/app/api/parent/bookings/route'

type MockFn = jest.Mock

// ─── Chain builder (mirrors guest suite) ─────────────────────────────────────

function makeChain(defaults: { data?: unknown; error?: unknown } = {}) {
  const chain: Record<string, MockFn> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'gte', 'lte', 'or', 'order', 'limit', 'insert', 'update']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.single = jest.fn().mockResolvedValue({ data: defaults.data ?? null, error: defaults.error ?? null })
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: defaults.data ?? null, error: defaults.error ?? null })
  return chain
}

/** List chain — awaited directly (thenable), resolves { data, error }. */
function makeListChain(defaults: { data?: unknown; error?: unknown } = {}) {
  const result = { data: defaults.data ?? [], error: defaults.error ?? null }
  const chain: Record<string, MockFn> & { then?: unknown } = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'or', 'order', 'limit', 'gte', 'lte']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

function makeStripeMock() {
  return {
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test_1',
        status: 'requires_payment_method',
        client_secret: 'pi_test_1_secret',
      }),
      retrieve: jest.fn(),
      cancel: jest.fn().mockResolvedValue({}),
    },
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const COACH_ID = '11111111-1111-4111-8111-111111111111'
const SPORT_ID = '22222222-2222-4222-8222-222222222222'
const CHILD_A = '33333333-3333-4333-8333-333333333333'
const CHILD_B = '44444444-4444-4444-8444-444444444444'
const USER_PROFILE_ID = 'user-profile-uuid-001'
const PARENT_PROFILE_ID = 'parent-profile-uuid-001'

const PARENT_CONTEXT = {
  context: {
    user: { id: 'auth-user-1', email: 'parent@example.com' },
    userProfile: { id: USER_PROFILE_ID },
    parentProfile: { id: PARENT_PROFILE_ID },
  },
  error: null,
}

const COACH_ROW = {
  id: COACH_ID,
  cancellation_window_hours: 24,
  min_advance_hours: 12,
  max_advance_days: 90,
  is_profile_live: true,
  is_paused: false,
  is_suspended: false,
  deleted_at: null,
}

const COACH_SPORT_ROW = {
  price_individual_pence: 6000,
  session_types: ['individual', 'group'],
  group_price_tiers: { '2': 9000, '3': 12000 },
  session_duration_minutes: 60,
  currency: 'GBP',
  is_active: true,
}

const PLATFORM_CONFIG_ROW = { default_commission_rate: 0.1 }
const BOOKING_ROW = { id: 'booking-uuid-001' }

const VALID_GROUP_BODY = {
  coachId: COACH_ID,
  sportId: SPORT_ID,
  date: '2099-07-06',
  startTime: '10:00',
  pricePence: 9000,
  players: [
    { name: 'Yuwin', age: 10, childProfileId: CHILD_A },
    { name: 'Sam', age: 9 },
  ],
  idempotencyToken: null,
}

function callPost(body: unknown) {
  const req = new Request('http://localhost/api/parent/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  // NextRequest is Request-compatible for .json()
  return POST(req as never)
}

/** Standard happy-path wiring; returns the chains for assertions. */
function wireHappyPath(overrides: { coachSport?: unknown; ownedChildren?: unknown[] } = {}) {
  ;(requireParentContext as MockFn).mockResolvedValue(PARENT_CONTEXT)
  ;(validateSlotAvailability as MockFn).mockResolvedValue({ ok: true })
  ;(resolveIndividualCanonicalPrice as MockFn).mockImplementation(
    (_c: unknown, args: { sportDefaultPence: number }) =>
      Promise.resolve({ price: args.sportDefaultPence }),
  )

  const childOwnershipChain = makeListChain({
    data: overrides.ownedChildren ?? [{ id: CHILD_A }],
  })
  const rlsFrom = jest.fn().mockReturnValue(childOwnershipChain)
  ;(createClient as MockFn).mockResolvedValue({ from: rlsFrom })

  const coachChain = makeChain({ data: COACH_ROW })
  const sportChain = makeChain({ data: overrides.coachSport ?? COACH_SPORT_ROW })
  const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
  const bookingChain = makeChain({ data: BOOKING_ROW })
  const piInsertChain = makeChain({ data: null, error: null })

  const adminFrom = jest.fn()
    .mockReturnValueOnce(coachChain)
    .mockReturnValueOnce(sportChain)
    .mockReturnValueOnce(configChain)
    .mockReturnValueOnce(bookingChain)
    .mockReturnValueOnce(piInsertChain)
  ;(createAdminClient as MockFn).mockReturnValue({ from: adminFrom })

  const stripeMock = makeStripeMock()
  ;(getStripe as MockFn).mockReturnValue(stripeMock)

  return { bookingChain, piInsertChain, stripeMock, rlsFrom, adminFrom, childOwnershipChain }
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('POST /api/parent/bookings — auth', () => {
  it('returns the gate error verbatim when requireParentContext rejects', async () => {
    ;(requireParentContext as MockFn).mockResolvedValue({
      context: null,
      error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }),
    })
    ;(createClient as MockFn).mockResolvedValue({ from: jest.fn() })

    const res = await callPost(VALID_GROUP_BODY)
    expect(res.status).toBe(401)
  })

  it('403 child_not_found when a linked child is not owned by this parent', async () => {
    const { rlsFrom } = wireHappyPath({ ownedChildren: [] })

    const res = await callPost(VALID_GROUP_BODY)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'child_not_found' })
    expect(rlsFrom).toHaveBeenCalledWith('child_profiles')
  })
})

// ─── Validation ──────────────────────────────────────────────────────────────

describe('POST /api/parent/bookings — validation', () => {
  it('400 invalid_body without a players array (no legacy field fallback)', async () => {
    ;(requireParentContext as MockFn).mockResolvedValue(PARENT_CONTEXT)
    const res = await callPost({
      ...VALID_GROUP_BODY,
      players: undefined,
      participantName: 'Yuwin',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
  })

  it('D5: 400 too_many_players beyond the highest tier key', async () => {
    wireHappyPath()
    const res = await callPost({
      ...VALID_GROUP_BODY,
      pricePence: 12000,
      players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'too_many_players' })
  })

  it('409 price_mismatch when the client price differs from the tier', async () => {
    wireHappyPath()
    const res = await callPost({ ...VALID_GROUP_BODY, pricePence: 4000 })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'price_mismatch' })
  })
})

// ─── Creation ────────────────────────────────────────────────────────────────

describe('POST /api/parent/bookings — creation', () => {
  it('creates a group booking: derived session_type, tier price, 054 storage, child links', async () => {
    const { bookingChain, stripeMock } = wireHappyPath()

    const res = await callPost(VALID_GROUP_BODY)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      clientSecret: 'pi_test_1_secret',
      bookingId: 'booking-uuid-001',
    })

    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.session_type).toBe('group') // derived, never client-asserted
    expect(insertArg.booked_by_user_id).toBe(USER_PROFILE_ID)
    expect(insertArg.child_profile_id).toBe(CHILD_A) // primary's profile
    expect(insertArg.coach_price_pence).toBe(9000) // tiers['2']
    expect(insertArg.commission_pence).toBe(900) // BR-01: 10% on top
    expect(insertArg.parent_total_pence).toBe(9900)
    expect(insertArg.status).toBe('pending_payment') // BR-06
    expect(insertArg.participant_name).toBe('Yuwin')
    expect(insertArg.participant_age).toBe(10)
    expect(insertArg.additional_participants).toEqual([
      { name: 'Sam', age: 9, child_profile_id: null },
    ])

    // Stripe charged the full parent total, with group metadata.
    const piArgs = (stripeMock.paymentIntents.create as MockFn).mock.calls[0][0] as {
      amount: number
      metadata: Record<string, string>
    }
    expect(piArgs.amount).toBe(9900)
    expect(piArgs.metadata.player_count).toBe('2')
  })

  it('creates a 1-player booking as individual with a null additional_participants', async () => {
    const { bookingChain } = wireHappyPath()

    const res = await callPost({
      ...VALID_GROUP_BODY,
      pricePence: 6000,
      players: [{ name: 'Yuwin', age: 10, childProfileId: CHILD_A }],
    })
    expect(res.status).toBe(200)

    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.session_type).toBe('individual')
    expect(insertArg.coach_price_pence).toBe(6000)
    expect(insertArg.additional_participants).toBeNull()
  })

  it('a guest-primary group booking stores child_profile_id null but keeps other links', async () => {
    const { bookingChain } = wireHappyPath({ ownedChildren: [{ id: CHILD_B }] })

    const res = await callPost({
      ...VALID_GROUP_BODY,
      players: [
        { name: 'Sam', age: 9 },
        { name: 'Arthur', age: 11, childProfileId: CHILD_B },
      ],
    })
    expect(res.status).toBe(200)

    const insertArg = (bookingChain.insert as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.child_profile_id).toBeNull()
    expect(insertArg.additional_participants).toEqual([
      { name: 'Arthur', age: 11, child_profile_id: CHILD_B },
    ])
  })

  it('409 slot_taken when the booking insert hits the exclusion trigger (23P01)', async () => {
    ;(requireParentContext as MockFn).mockResolvedValue(PARENT_CONTEXT)
    ;(validateSlotAvailability as MockFn).mockResolvedValue({ ok: true })
    ;(createClient as MockFn).mockResolvedValue({
      from: jest.fn().mockReturnValue(makeListChain({ data: [{ id: CHILD_A }] })),
    })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const bookingChain = makeChain({ data: null, error: { code: '23P01' } })
    ;(createAdminClient as MockFn).mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(coachChain)
        .mockReturnValueOnce(sportChain)
        .mockReturnValueOnce(configChain)
        .mockReturnValueOnce(bookingChain),
    })
    ;(getStripe as MockFn).mockReturnValue(makeStripeMock())

    const res = await callPost(VALID_GROUP_BODY)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'slot_taken' })
  })

  it('a foreign idempotencyToken never replays another user\'s intent — key burns to per-booking', async () => {
    ;(requireParentContext as MockFn).mockResolvedValue(PARENT_CONTEXT)
    ;(validateSlotAvailability as MockFn).mockResolvedValue({ ok: true })
    ;(createClient as MockFn).mockResolvedValue({
      from: jest.fn().mockReturnValue(makeListChain({ data: [{ id: CHILD_A }] })),
    })

    // The token matches an existing intent — but its booking belongs to a
    // DIFFERENT user. The route must not return that intent's secret (it
    // must not even retrieve it) and must burn the token key.
    const piIdempotentChain = makeChain({
      data: { stripe_payment_intent_id: 'pi_foreign', booking_id: 'foreign-booking' },
    })
    const foreignBookingChain = makeChain({
      data: {
        booking_reference: 'CRK-2099-FOREIGN',
        status: 'pending_payment',
        deleted_at: null,
        booked_by_user_id: 'someone-else-entirely',
      },
    })
    const coachChain = makeChain({ data: COACH_ROW })
    const sportChain = makeChain({ data: COACH_SPORT_ROW })
    const configChain = makeChain({ data: PLATFORM_CONFIG_ROW })
    const bookingChain = makeChain({ data: BOOKING_ROW })
    const piInsertChain = makeChain({ data: null, error: null })
    ;(createAdminClient as MockFn).mockReturnValue({
      from: jest.fn()
        .mockReturnValueOnce(piIdempotentChain)
        .mockReturnValueOnce(foreignBookingChain)
        .mockReturnValueOnce(coachChain)
        .mockReturnValueOnce(sportChain)
        .mockReturnValueOnce(configChain)
        .mockReturnValueOnce(bookingChain)
        .mockReturnValueOnce(piInsertChain),
    })
    const stripeMock = makeStripeMock()
    ;(getStripe as MockFn).mockReturnValue(stripeMock)

    const res = await callPost({ ...VALID_GROUP_BODY, idempotencyToken: 'stolen-token' })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { bookingId: string }
    expect(json.bookingId).toBe('booking-uuid-001') // a FRESH booking, not the foreign one
    expect(stripeMock.paymentIntents.retrieve).not.toHaveBeenCalled()
    // Burned: the new intent uses the per-booking key, not the token key.
    const createOpts = (stripeMock.paymentIntents.create as MockFn).mock.calls[0][1] as {
      idempotencyKey: string
    }
    expect(createOpts.idempotencyKey).toBe('parent-booking-booking-uuid-001')
  })

  it('rolls back the booking when Stripe intent creation fails', async () => {
    // Stripe fails BEFORE the payment_intents insert, so the rollback's
    // from('bookings') consumes the next queued chain (piInsertChain).
    const { piInsertChain, stripeMock } = wireHappyPath()
    ;(stripeMock.paymentIntents.create as MockFn).mockRejectedValue(new Error('stripe down'))

    const res = await callPost(VALID_GROUP_BODY)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'payment_init_failed' })
    // Soft delete, never hard DELETE.
    const updateArg = (piInsertChain.update as MockFn).mock.calls[0][0] as Record<string, unknown>
    expect(typeof updateArg.deleted_at).toBe('string')
  })
})
