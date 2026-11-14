// STAGE1-CANCEL-OFFLINE (Decision T-21): PATCH /api/coaches/programmes/[id]
// with status 'cancelled'.
//   → a programme with paid enrolments needs confirm_direct_refunds: true;
//     without it the route returns 409 and changes nothing
//   → the cancellation emails are dispatched exactly once, by the request that
//     wins the guarded status update — repeat and losing calls send nothing
//   → a programme with no paid enrolments cancels as before
//   → non-cancel updates are untouched by any of this

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({ getAll: () => [], set: jest.fn() })),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/programmes/cancellation-notice', () => ({
  countPaidEnrolments: jest.fn(),
  notifyProgrammeCancelled: jest.fn(),
}))

import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { countPaidEnrolments, notifyProgrammeCancelled } from '@/lib/programmes/cancellation-notice'

const mockCount = countPaidEnrolments as jest.Mock
const mockNotify = notifyProgrammeCancelled as jest.Mock

function makeChain() {
  const c: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'gte', 'lte', 'or', 'order', 'limit', 'upsert', 'insert', 'update', 'delete', 'not']) {
    c[m] = jest.fn(() => c)
  }
  c.single = jest.fn()
  c.maybeSingle = jest.fn()
  return c
}

const mockGetUser = jest.fn()
const mockFrom = jest.fn()
const mockSupabase = { auth: { getUser: mockGetUser }, from: mockFrom }

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
  mockNotify.mockResolvedValue(undefined)
})

// requireCoachContext = 3 SSR from() calls (user_profiles → role + coach).
// Any later SSR from() (the sports name read) falls through to a null row.
function mockPatchAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
  mockFrom.mockImplementation(() => {
    const c = makeChain()
    c.single.mockResolvedValue({ data: null, error: null })
    return c
  })
  mockFrom
    .mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { id: 'profile-uuid' }, error: null })
      return c
    })
    .mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { role: 'coach' }, error: null })
      return c
    })
    .mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { id: 'coach-uuid' }, error: null })
      return c
    })
}

type SingleResult = { data: Record<string, unknown> | null; error: { code: string } | null }

// One shared admin chain. .single resolves the existing-programme read, then
// (when supplied) the update result. Thenable resolves list reads to empty.
function makeAdmin(existing: Record<string, unknown> | null, update?: SingleResult) {
  const chain: Record<string, unknown> = {}
  const calls: Record<string, jest.Mock> = {}
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'is', 'in', 'order', 'gte', 'lte', 'not']) {
    calls[m] = jest.fn(() => chain)
    chain[m] = calls[m]
  }
  const single = jest.fn()
  single.mockResolvedValueOnce(
    existing ? { data: existing, error: null } : { data: null, error: { code: 'PGRST116' } },
  )
  if (update) single.mockResolvedValueOnce(update)
  chain.single = single
  chain.then = (resolve: (r: unknown) => void) => resolve({ data: [], error: null })
  const admin = { from: jest.fn(() => chain) }
  ;(createAdminClient as jest.Mock).mockReturnValue(admin)
  return { admin, calls }
}

async function callPatch(body: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/coaches/programmes/[programmeId]/route')
  const request = new Request('http://localhost/api/coaches/programmes/prog-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return PATCH(request as unknown as NextRequest, { params: Promise.resolve({ programmeId: 'prog-1' }) })
}

const existingActive = {
  id: 'prog-1', status: 'active', current_spots: 3, max_spots: 10, schedule_type: 'fixed',
  days_of_week: [6], day_of_week: 6, session_count: 6, starts_at: null, ends_at: null,
  camp_mode: false, payment_type: 'block_upfront',
}

const cancelledRow = {
  id: 'prog-1', sport_id: null, title: 'Summer Batting Camp', description: null,
  schedule_type: 'fixed', day_of_week: 6, days_of_week: [6], start_time: '10:00:00',
  duration_minutes: 60, max_spots: 10, current_spots: 3, payment_type: 'block_upfront',
  price_per_session_pence: 1000, block_price_pence: 6000, block_session_count: 6,
  currency: 'GBP', status: 'cancelled', created_at: '2026-10-01T00:00:00Z',
  venue_name: null, venue_address: null, skill_level: 'all', session_count: 6,
  min_participants: null, cancellation_window_hours: 24, image_url: null, age_groups: [],
  starts_at: null, ends_at: null, camp_mode: false,
}

describe('PATCH programme → cancelled, paid enrolments (T-21)', () => {
  it('returns 409 and changes nothing when the coach has not confirmed direct refunds', async () => {
    mockPatchAuth()
    const { calls } = makeAdmin(existingActive)
    mockCount.mockResolvedValue(3)

    const res = await callPatch({ status: 'cancelled' })
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.code).toBe('PAID_ENROLMENTS_CONFIRM_REQUIRED')
    expect(json.paid_enrolment_count).toBe(3)
    expect(json.message).toBe(
      'Parents have already paid. You must refund them directly. Crikly does not refund programme fees.',
    )
    expect(calls.update).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it.each([['true'], [1], [false], [null]])(
    'treats confirm_direct_refunds=%p as not confirmed (strict boolean true only)',
    async (value) => {
      mockPatchAuth()
      const { calls } = makeAdmin(existingActive)
      mockCount.mockResolvedValue(1)

      const res = await callPatch({ status: 'cancelled', confirm_direct_refunds: value })

      expect(res.status).toBe(409)
      expect(calls.update).not.toHaveBeenCalled()
      expect(mockNotify).not.toHaveBeenCalled()
    },
  )

  it('cancels and dispatches the emails once when the coach has confirmed', async () => {
    mockPatchAuth()
    const { admin, calls } = makeAdmin(existingActive, { data: cancelledRow, error: null })
    mockCount.mockResolvedValue(3)

    const res = await callPatch({ status: 'cancelled', confirm_direct_refunds: true })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.status).toBe('cancelled')
    // Only the programme status is written — the flag never reaches the row.
    expect(calls.update).toHaveBeenCalledTimes(1)
    expect(calls.update).toHaveBeenCalledWith({ status: 'cancelled', updated_at: expect.any(String) })
    // Guarded update: lands only while the status is still the one read.
    expect(calls.eq).toHaveBeenCalledWith('status', 'active')
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith(admin, {
      programmeId: 'prog-1',
      programmeTitle: 'Summer Batting Camp',
      coachProfileId: 'coach-uuid',
    })
  })

  it('writes only to group_programmes — never enrolments, payouts or payment intents', async () => {
    mockPatchAuth()
    const { admin } = makeAdmin(existingActive, { data: cancelledRow, error: null })
    mockCount.mockResolvedValue(3)

    await callPatch({ status: 'cancelled', confirm_direct_refunds: true })

    const tables = (admin.from as jest.Mock).mock.calls.map((c) => c[0])
    expect(tables).not.toContain('group_programme_enrolments')
    expect(tables).not.toContain('payouts')
    expect(tables).not.toContain('payment_intents')
  })

  it('still returns 200 when the notifier resolves after email failures', async () => {
    mockPatchAuth()
    makeAdmin(existingActive, { data: cancelledRow, error: null })
    mockCount.mockResolvedValue(2)
    mockNotify.mockResolvedValue({
      paidEnrolments: 2, parentEmailsSent: 0, parentEmailsFailed: 2,
      parentsWithoutAddress: 0, coachEmailSent: false, opsEmailSent: false,
    })

    const res = await callPatch({ status: 'cancelled', confirm_direct_refunds: true })

    expect(res.status).toBe(200)
  })
})

describe('PATCH programme → cancelled, send-once guarantees (T-21)', () => {
  it('a repeat cancel on an already-cancelled programme returns 400 and sends nothing', async () => {
    mockPatchAuth()
    const { calls } = makeAdmin({ ...existingActive, status: 'cancelled' })

    const res = await callPatch({ status: 'cancelled', confirm_direct_refunds: true })

    expect(res.status).toBe(400)
    expect(mockCount).not.toHaveBeenCalled()
    expect(calls.update).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('the losing request of two overlapping cancels returns 409 and sends nothing', async () => {
    mockPatchAuth()
    // Both requests read 'active'; this one's guarded update matches no row.
    makeAdmin(existingActive, { data: null, error: { code: 'PGRST116' } })
    mockCount.mockResolvedValue(3)

    const res = await callPatch({ status: 'cancelled', confirm_direct_refunds: true })
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toBe('Conflict detected')
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('fails closed with 500 when the paid-enrolment count cannot be read', async () => {
    mockPatchAuth()
    const { calls } = makeAdmin(existingActive)
    mockCount.mockResolvedValue(null)

    const res = await callPatch({ status: 'cancelled', confirm_direct_refunds: true })

    expect(res.status).toBe(500)
    expect(calls.update).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it("returns 404 for another coach's programme without counting or notifying", async () => {
    mockPatchAuth()
    makeAdmin(null)

    const res = await callPatch({ status: 'cancelled', confirm_direct_refunds: true })

    expect(res.status).toBe(404)
    expect(mockCount).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })
})

describe('PATCH programme → cancelled, no paid enrolments (unchanged behaviour)', () => {
  it('cancels without any confirmation flag', async () => {
    mockPatchAuth()
    const { calls } = makeAdmin(existingActive, { data: cancelledRow, error: null })
    mockCount.mockResolvedValue(0)

    const res = await callPatch({ status: 'cancelled' })

    expect(res.status).toBe(200)
    expect(calls.update).toHaveBeenCalledWith({ status: 'cancelled', updated_at: expect.any(String) })
    // The notifier is still invoked (it re-reads and no-ops when nobody paid),
    // so a parent who paid between the count and the cancel is not missed.
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })
})

describe('PATCH programme — non-cancel updates are untouched', () => {
  it('does not count, guard on status, or notify for a title edit', async () => {
    mockPatchAuth()
    const { calls } = makeAdmin(existingActive, {
      data: { ...cancelledRow, status: 'active', title: 'New title' },
      error: null,
    })

    const res = await callPatch({ title: 'New title' })

    expect(res.status).toBe(200)
    expect(mockCount).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
    expect(calls.eq).not.toHaveBeenCalledWith('status', expect.anything())
  })

  it('does not count or notify for an active → completed transition', async () => {
    mockPatchAuth()
    makeAdmin(existingActive, { data: { ...cancelledRow, status: 'completed' }, error: null })

    const res = await callPatch({ status: 'completed' })

    expect(res.status).toBe(200)
    expect(mockCount).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })
})
