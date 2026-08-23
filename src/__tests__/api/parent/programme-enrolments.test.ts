// Integration tests for POST /api/parent/programme-enrolments (BUG-79).
//
// Scope: what is NEW on this route versus the guest enrolment route — auth
// gating, attachment to the parent's REAL user_profiles row (no provisional
// user is ever created), the authed idempotency ownership guard, rollback
// that never touches user_profiles, and session-derived email metadata.
// Price derivation / capacity / camp reservation are copied 1:1 from the
// guest route and proven by src/__tests__/api/guest/programme-enrolments.test.ts.

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/stripe/client', () => ({ getStripe: jest.fn() }))
jest.mock('@/lib/auth/require-parent', () => ({ requireParentContext: jest.fn() }))

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { requireParentContext } from '@/lib/auth/require-parent'
import { POST } from '@/app/api/parent/programme-enrolments/route'

type MockFn = jest.Mock

// ─── Chain builders (mirror the parent bookings suite) ───────────────────────

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
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'or', 'order', 'limit', 'gte', 'lte', 'insert']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

function makeStripeMock() {
  return {
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test_enrol_1',
        status: 'requires_payment_method',
        client_secret: 'pi_test_enrol_1_secret',
      }),
      retrieve: jest.fn(),
      cancel: jest.fn().mockResolvedValue({}),
    },
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const COACH_ID = 'coach-uuid-001'
const PROGRAMME_ID = 'programme-uuid-001'
const SESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SESSION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER_PROFILE_ID = 'user-profile-uuid-001'
const PARENT_PROFILE_ID = 'parent-profile-uuid-001'
const ENROLMENT_ID = 'enrolment-uuid-001'

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
  is_profile_live: true,
  is_paused: false,
  is_suspended: false,
  deleted_at: null,
}

const PROGRAMME_ROW = {
  id: PROGRAMME_ID,
  coach_profile_id: COACH_ID,
  payment_type: 'per_session',
  price_per_session_pence: 2500,
  block_price_pence: null,
  block_session_count: null,
  max_spots: 10,
  current_spots: 2,
  currency: 'GBP',
  status: 'active',
  deleted_at: null,
  camp_mode: false,
}

const SESSION_ROWS = [
  { id: SESSION_A, session_date: '2099-07-06', status: 'scheduled', start_time: '10:00', end_time: '11:00', slots: null },
  { id: SESSION_B, session_date: '2099-07-13', status: 'scheduled', start_time: '10:00', end_time: '11:00', slots: null },
]

const PLATFORM_CONFIG_ROW = { default_commission_rate: 0.1 }

const VALID_BODY = {
  coachId: COACH_ID,
  programmeId: PROGRAMME_ID,
  paymentType: 'per_session',
  selectedSessionIds: [SESSION_A, SESSION_B],
  participantName: 'Yuwin',
  participantAge: 10,
  idempotencyToken: null,
}

function callPost(body: unknown) {
  const req = new Request('http://localhost/api/parent/programme-enrolments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(req as never)
}

interface Wiring {
  adminFrom: MockFn
  rlsFrom: MockFn
  childProfilesChain: ReturnType<typeof makeChain>
  userProfilesChain: ReturnType<typeof makeChain>
  enrolmentChain: ReturnType<typeof makeChain>
  enrolmentSessionsChain: ReturnType<typeof makeListChain>
  piChain: ReturnType<typeof makeChain>
  stripeMock: ReturnType<typeof makeStripeMock>
}

/** Table-keyed admin `from()` router — order-independent. */
function wireHappyPath(overrides: {
  existingPi?: unknown
  existingEnrolment?: unknown
  enrolmentInsertError?: unknown
  bookerProfile?: unknown
  /** PROGRAMME-CHILD-PICKER: what the RLS child_profiles ownership read returns. */
  ownedChild?: unknown
  ownedChildError?: unknown
} = {}): Wiring {
  ;(requireParentContext as MockFn).mockResolvedValue(PARENT_CONTEXT)
  const childProfilesChain = makeChain({
    data: overrides.ownedChild ?? null,
    error: overrides.ownedChildError ?? null,
  })
  const rlsFrom = jest.fn((table: string) => {
    if (table !== 'child_profiles') throw new Error(`unexpected RLS table ${table}`)
    return childProfilesChain
  })
  ;(createClient as MockFn).mockResolvedValue({ from: rlsFrom })

  const userProfilesChain = makeChain({
    data: overrides.bookerProfile ?? { full_name: 'Pat Parent' },
  })
  const enrolmentChain = makeChain({
    data: overrides.enrolmentInsertError ? null : { id: ENROLMENT_ID, enrolment_reference: 'CRK-2099-ABCDEF', booked_by_user_id: USER_PROFILE_ID },
    error: overrides.enrolmentInsertError ?? null,
  })
  // Idempotency replay lookups read group_programme_enrolments via maybeSingle
  // before the insert; let a test override that read.
  if (overrides.existingEnrolment !== undefined) {
    enrolmentChain.maybeSingle.mockResolvedValue({ data: overrides.existingEnrolment, error: null })
  }
  const enrolmentSessionsChain = makeListChain({ data: [] })
  const piChain = makeChain({ data: overrides.existingPi ?? null, error: null })

  const tables: Record<string, unknown> = {
    user_profiles: userProfilesChain,
    coach_profiles: makeChain({ data: COACH_ROW }),
    group_programmes: makeChain({ data: PROGRAMME_ROW }),
    group_programme_sessions: makeListChain({ data: SESSION_ROWS }),
    platform_config: makeChain({ data: PLATFORM_CONFIG_ROW }),
    group_programme_enrolments: enrolmentChain,
    group_programme_enrolment_sessions: enrolmentSessionsChain,
    payment_intents: piChain,
  }
  const adminFrom = jest.fn((table: string) => {
    const chain = tables[table]
    if (!chain) throw new Error(`unexpected table ${table}`)
    return chain
  })
  ;(createAdminClient as MockFn).mockReturnValue({ from: adminFrom, rpc: jest.fn() })

  const stripeMock = makeStripeMock()
  ;(getStripe as MockFn).mockReturnValue(stripeMock)

  return { adminFrom, rlsFrom, childProfilesChain, userProfilesChain, enrolmentChain, enrolmentSessionsChain, piChain, stripeMock }
}

const CHILD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('POST /api/parent/programme-enrolments — auth', () => {
  it('returns the gate error verbatim when requireParentContext rejects (401)', async () => {
    ;(requireParentContext as MockFn).mockResolvedValue({
      context: null,
      error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }),
    })
    ;(createClient as MockFn).mockResolvedValue({ from: jest.fn() })
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn() })

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('returns 403 verbatim for a signed-in non-parent', async () => {
    ;(requireParentContext as MockFn).mockResolvedValue({
      context: null,
      error: NextResponse.json({ error: 'Forbidden — parent role required' }, { status: 403 }),
    })
    ;(createClient as MockFn).mockResolvedValue({ from: jest.fn() })

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(403)
  })
})

// ─── Validation ──────────────────────────────────────────────────────────────

describe('POST /api/parent/programme-enrolments — validation', () => {
  it('400 invalid_body when participantName is missing', async () => {
    const res = await callPost({ ...VALID_BODY, participantName: '' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_body' })
  })

  it('400 invalid_body for per_session with no selectedSessionIds', async () => {
    const res = await callPost({ ...VALID_BODY, selectedSessionIds: [] })
    expect(res.status).toBe(400)
  })

  it('400 payment_type_mismatch when client paymentType ≠ programme', async () => {
    wireHappyPath()
    const res = await callPost({ ...VALID_BODY, paymentType: 'block_upfront' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'payment_type_mismatch' })
  })
})

// ─── Happy path — the BUG-79 contract ────────────────────────────────────────

describe('POST /api/parent/programme-enrolments — account attachment', () => {
  it('attaches the enrolment to the REAL user profile and never inserts a provisional user', async () => {
    const { userProfilesChain, enrolmentChain, stripeMock } = wireHappyPath()

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.clientSecret).toBe('pi_test_enrol_1_secret')
    expect(json.enrolmentId).toBe(ENROLMENT_ID)
    expect(json.enrolmentReference).toMatch(/^CRK-\d{4}-[A-Z0-9]{6}$/)

    // No provisional profile — user_profiles is READ (full_name) but never written.
    expect(userProfilesChain.insert).not.toHaveBeenCalled()
    expect(userProfilesChain.update).not.toHaveBeenCalled()

    const inserted = enrolmentChain.insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.booked_by_user_id).toBe(USER_PROFILE_ID)
    expect(inserted.child_profile_id).toBeNull()
    expect(inserted.participant_name).toBe('Yuwin')
    expect(inserted.participant_age).toBe(10)
    expect(inserted.payment_status).toBe('pending') // BR-06
    // BR-01: commission on top — 2 × 2500 = 5000 coach, 10% = 500, total 5500.
    expect(inserted.coach_amount_pence).toBe(5000)
    expect(inserted.commission_pence).toBe(500)
    expect(inserted.parent_total_pence).toBe(5500)
    expect(inserted.currency).toBe('GBP')

    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5500, currency: 'gbp' }),
      { idempotencyKey: `parent-enrolment-${ENROLMENT_ID}` },
    )
  })

  it('fills guest_email / guest_name metadata from the SESSION so the webhook emails the parent', async () => {
    const { stripeMock } = wireHappyPath()

    await callPost({ ...VALID_BODY, participantAge: null })

    const args = stripeMock.paymentIntents.create.mock.calls[0][0] as { metadata: Record<string, string> }
    expect(args.metadata.guest_email).toBe('parent@example.com')
    expect(args.metadata.guest_name).toBe('Pat Parent')
    expect(args.metadata.enrolment_id).toBe(ENROLMENT_ID)
    expect(args.metadata.participant_name).toBe('Yuwin')
    expect(args.metadata.participant_age).toBeUndefined()
  })

  it('uses the client idempotency token as the Stripe key when supplied', async () => {
    const { stripeMock } = wireHappyPath()
    await callPost({ ...VALID_BODY, idempotencyToken: 'tok-123' })
    expect(stripeMock.paymentIntents.create.mock.calls[0][1]).toEqual({
      idempotencyKey: 'parent-enrolment-tok-123',
    })
  })
})

// ─── Idempotency ownership guard ─────────────────────────────────────────────

describe('POST /api/parent/programme-enrolments — idempotency', () => {
  it('replays the existing intent when the token belongs to THIS parent', async () => {
    const { stripeMock } = wireHappyPath({
      existingPi: { stripe_payment_intent_id: 'pi_existing', enrolment_id: ENROLMENT_ID },
      existingEnrolment: { enrolment_reference: 'CRK-2099-EXIST1', booked_by_user_id: USER_PROFILE_ID },
    })
    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      status: 'requires_payment_method',
      client_secret: 'pi_existing_secret',
    })

    const res = await callPost({ ...VALID_BODY, idempotencyToken: 'tok-123' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      clientSecret: 'pi_existing_secret',
      enrolmentReference: 'CRK-2099-EXIST1',
      enrolmentId: ENROLMENT_ID,
    })
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled()
  })

  it("never returns another user's client secret — a foreign token burns to a per-enrolment key", async () => {
    const { stripeMock } = wireHappyPath({
      existingPi: { stripe_payment_intent_id: 'pi_foreign', enrolment_id: 'someone-elses-enrolment' },
      existingEnrolment: { enrolment_reference: 'CRK-2099-THEIRS', booked_by_user_id: 'other-user' },
    })

    const res = await callPost({ ...VALID_BODY, idempotencyToken: 'tok-123' })
    expect(res.status).toBe(200)
    expect(stripeMock.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(stripeMock.paymentIntents.create.mock.calls[0][1]).toEqual({
      idempotencyKey: `parent-enrolment-${ENROLMENT_ID}`,
    })
  })
})

// ─── Rollback — real account is never touched ────────────────────────────────

describe('POST /api/parent/programme-enrolments — rollback', () => {
  it('Stripe failure soft-fails the enrolment and leaves user_profiles untouched', async () => {
    const { stripeMock, enrolmentChain, userProfilesChain } = wireHappyPath()
    stripeMock.paymentIntents.create.mockRejectedValue(new Error('stripe down'))

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'payment_init_failed' })

    expect(enrolmentChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: 'failed', status: 'cancelled' }),
    )
    expect(userProfilesChain.update).not.toHaveBeenCalled()
  })

  it('409 spots_taken when the programme is full', async () => {
    wireHappyPath()
    ;(createAdminClient as MockFn).mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'group_programmes'
          ? makeChain({ data: { ...PROGRAMME_ROW, current_spots: 10 } })
          : table === 'group_programme_sessions'
            ? makeListChain({ data: SESSION_ROWS })
            : table === 'coach_profiles'
              ? makeChain({ data: COACH_ROW })
              : makeChain({ data: PLATFORM_CONFIG_ROW }),
      ),
      rpc: jest.fn(),
    })

    const res = await callPost(VALID_BODY)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'spots_taken' })
  })
})

// ─── PROGRAMME-CHILD-PICKER: child linking ───────────────────────────────────

describe('POST /api/parent/programme-enrolments — child linking', () => {
  it('stores child_profile_id when the child belongs to THIS parent (RLS-scoped read)', async () => {
    const { rlsFrom, childProfilesChain, enrolmentChain, adminFrom } = wireHappyPath({
      ownedChild: { id: CHILD_ID },
    })

    const res = await callPost({ ...VALID_BODY, childProfileId: CHILD_ID })
    expect(res.status).toBe(200)

    // Ownership is read through the RLS client, never the admin client.
    expect(rlsFrom).toHaveBeenCalledWith('child_profiles')
    expect(adminFrom).not.toHaveBeenCalledWith('child_profiles')
    expect(childProfilesChain.eq).toHaveBeenCalledWith('parent_profile_id', PARENT_PROFILE_ID)
    expect(childProfilesChain.eq).toHaveBeenCalledWith('id', CHILD_ID)
    expect(childProfilesChain.is).toHaveBeenCalledWith('deleted_at', null)

    const inserted = enrolmentChain.insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.child_profile_id).toBe(CHILD_ID)
    // participant_name stays populated alongside the link (roster/email fallback).
    expect(inserted.participant_name).toBe('Yuwin')
  })

  it("403 child_not_found for a child that is not this parent's (or deleted) — nothing is written", async () => {
    const { enrolmentChain, stripeMock } = wireHappyPath({ ownedChild: null })

    const res = await callPost({ ...VALID_BODY, childProfileId: CHILD_ID })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'child_not_found' })
    expect(enrolmentChain.insert).not.toHaveBeenCalled()
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled()
  })

  it('400 invalid_body for a malformed childProfileId', async () => {
    const { rlsFrom } = wireHappyPath({ ownedChild: { id: CHILD_ID } })
    const res = await callPost({ ...VALID_BODY, childProfileId: 'not-a-uuid' })
    expect(res.status).toBe(400)
    expect(rlsFrom).not.toHaveBeenCalled()
  })

  it('500 internal_error when the ownership read fails', async () => {
    const { enrolmentChain } = wireHappyPath({ ownedChildError: { message: 'boom' } })
    const res = await callPost({ ...VALID_BODY, childProfileId: CHILD_ID })
    expect(res.status).toBe(500)
    expect(enrolmentChain.insert).not.toHaveBeenCalled()
  })

  it('null / absent childProfileId skips the ownership read and stores null (BUG-79 behaviour unchanged)', async () => {
    const { rlsFrom, enrolmentChain } = wireHappyPath()
    const res = await callPost({ ...VALID_BODY, childProfileId: null })
    expect(res.status).toBe(200)
    expect(rlsFrom).not.toHaveBeenCalled()
    const inserted = enrolmentChain.insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.child_profile_id).toBeNull()
  })
})
