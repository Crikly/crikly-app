jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    getAll: () => [],
    set: jest.fn(),
  })),
}))

// BUG-17: the ad-hoc conflict path builds an admin client and calls
// getCoachCommitments. Stub the admin client (unused once the helper is mocked)
// and mock getCoachCommitments while keeping the real findFirstConflict.
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({})),
}))
jest.mock('@/lib/availability/commitments', () => {
  const actual = jest.requireActual('@/lib/availability/commitments')
  return { ...actual, getCoachCommitments: jest.fn() }
})

import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { getCoachCommitments } from '@/lib/availability/commitments'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeChain() {
  const c: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'gte', 'lte', 'or', 'order', 'limit', 'upsert', 'insert', 'update', 'filter', 'returns']) {
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
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function callPost(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/coaches/availability/route')
  const request = new Request('http://localhost/api/coaches/availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(request as unknown as NextRequest)
}

function passAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
  const chain = makeChain()
  mockFrom.mockReturnValue(chain)
  chain.single
    .mockResolvedValueOnce({ data: { id: 'profile-uuid' }, error: null })
    .mockResolvedValueOnce({ data: { role: 'coach' }, error: null })
    .mockResolvedValueOnce({ data: { id: 'coach-uuid' }, error: null })
  return chain
}

// ─── Auth guards ──────────────────────────────────────────────────────────────

describe('POST /api/coaches/availability — auth guards', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') })

    const res = await callPost({ day_of_week: 1, start_time: '09:00', end_time: '10:00' })
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('Unauthorised')
  })

  it('returns 403 when user has no coach role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    const chain = makeChain()
    mockFrom.mockReturnValue(chain)
    chain.single
      .mockResolvedValueOnce({ data: { id: 'profile-uuid' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('not found') })

    const res = await callPost({ day_of_week: 1, start_time: '09:00', end_time: '10:00' })
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toContain('coach role required')
  })
})

// ─── POST validation ──────────────────────────────────────────────────────────

describe('POST /api/coaches/availability — validation', () => {
  it('returns 400 when day_of_week is out of range', async () => {
    passAuth()
    const res = await callPost({ day_of_week: 7, start_time: '09:00', end_time: '10:00' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('day_of_week')]))
  })

  it('returns 400 when start_time is missing', async () => {
    passAuth()
    const res = await callPost({ day_of_week: 1, end_time: '10:00' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('start_time')]))
  })

  it('returns 400 when end_time is before start_time', async () => {
    passAuth()
    const res = await callPost({ day_of_week: 1, start_time: '10:00', end_time: '09:00' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('end_time')]))
  })

  it('returns 400 when slot duration is less than 30 minutes', async () => {
    passAuth()
    const res = await callPost({ day_of_week: 1, start_time: '09:00', end_time: '09:20' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('30')]))
  })
})

// ─── Overlap detection ────────────────────────────────────────────────────────

// Queues exactly the 3 from() calls requireCoachContextOrCreate makes (all via
// .single). Tests add further .mockImplementationOnce(...) for any query the route
// makes after auth — queue EXACTLY what the path calls, or leftover onces leak
// into the next test (jest.clearAllMocks does not drain the once queue).
function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
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

describe('POST /api/coaches/availability — recurring overlap (BUG-17, sport-agnostic)', () => {
  it('returns 409 when a recurring block overlaps another recurring block, regardless of sport', async () => {
    mockAuth()
    // Recurring branch query terminates on .neq('is_recurring', false).
    mockFrom.mockImplementationOnce(() => {
      const c = makeChain()
      c.neq = jest.fn(() =>
        Promise.resolve({
          data: [{ id: 'existing-slot-uuid', start_time: '08:00:00', end_time: '11:00:00' }],
          error: null,
        }),
      )
      return c
    })

    const res = await callPost({ day_of_week: 1, start_time: '09:00', end_time: '10:00' })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.conflicting_block_id).toBe('existing-slot-uuid')
    // getCoachCommitments must NOT be consulted for recurring creation (Decision B).
    expect(getCoachCommitments as jest.Mock).not.toHaveBeenCalled()
  })
})

describe('POST /api/coaches/availability — ad-hoc conflict (BUG-17, date-scoped)', () => {
  it('returns 409 when an ad-hoc slot overlaps a committed programme session', async () => {
    ;(getCoachCommitments as jest.Mock).mockResolvedValue([
      { startMinutes: 540, endMinutes: 660, source: 'programme', label: 'a programme session' },
    ])
    // Ad-hoc path makes no post-auth from() call — the conflict comes from the
    // (mocked) helper — so only the 3 auth chains are queued.
    mockAuth()

    const res = await callPost({
      day_of_week: 1,
      start_time: '09:00',
      end_time: '10:00',
      is_recurring: false,
      specific_date: '2026-07-06',
    })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('Conflict detected')
    expect(data.message).toContain('a programme session')
    expect(getCoachCommitments as jest.Mock).toHaveBeenCalledWith(
      expect.anything(),
      'coach-uuid',
      '2026-07-06',
    )
  })

  it('returns 400 when an ad-hoc block omits specific_date', async () => {
    passAuth()
    const res = await callPost({
      day_of_week: 1,
      start_time: '09:00',
      end_time: '10:00',
      is_recurring: false,
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('specific_date is required')]))
  })
})

// ─── PATCH conflict detection ───────────────────────────────────────────────────

async function callPatch(blockId: string, body: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/coaches/availability/[blockId]/route')
  const request = new Request(`http://localhost/api/coaches/availability/${blockId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return PATCH(request as unknown as NextRequest, { params: Promise.resolve({ blockId }) })
}

// Queues the 4 from() calls the PATCH route makes before the conflict query:
// requireCoachContext (user_profiles single, then role + coach in parallel) + the
// existingBlock select. Tests add a 5th once only when the path issues a conflict
// query (recurring branch).
function mockPatchAuth(existingBlock: Record<string, unknown>) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
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
    .mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: existingBlock, error: null })
      return c
    })
}

describe('PATCH /api/coaches/availability/[blockId] — conflict (BUG-17)', () => {
  it('returns 409 when a recurring block edit overlaps another recurring block (sport-agnostic)', async () => {
    mockPatchAuth({
      id: 'block-1', sport_id: 'sport-a', day_of_week: 1, start_time: '09:00:00', end_time: '10:00:00', is_recurring: true, specific_date: null,
    })
    // Recurring branch conflict query chains two .neq() calls (is_recurring, id);
    // make the whole chain awaitable via then() so the terminal resolves the data
    // regardless of which method is last.
    mockFrom.mockImplementationOnce(() => {
      const c = makeChain()
      ;(c as unknown as Record<string, unknown>).then = (resolve: (r: unknown) => void) =>
        resolve({ data: [{ id: 'other-block', start_time: '08:00:00', end_time: '11:00:00' }], error: null })
      return c
    })

    const res = await callPatch('block-1', { start_time: '09:30', end_time: '10:30' })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.conflicting_block_id).toBe('other-block')
    expect(getCoachCommitments as jest.Mock).not.toHaveBeenCalled()
  })

  it('returns 409 when an ad-hoc block edit overlaps a committed booking', async () => {
    ;(getCoachCommitments as jest.Mock).mockResolvedValue([
      { startMinutes: 600, endMinutes: 660, source: 'booking', label: 'a confirmed booking' },
    ])
    // Ad-hoc path makes no conflict-query from() call (helper is mocked).
    mockPatchAuth({
      id: 'block-2', sport_id: null, day_of_week: 0, start_time: '09:00:00', end_time: '10:00:00', is_recurring: false, specific_date: '2026-07-05',
    })

    const res = await callPatch('block-2', { start_time: '10:00', end_time: '11:00' })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.message).toContain('a confirmed booking')
    expect(getCoachCommitments as jest.Mock).toHaveBeenCalledWith(
      expect.anything(),
      'coach-uuid',
      '2026-07-05',
      { excludeAvailabilityBlockId: 'block-2' },
    )
  })
})
