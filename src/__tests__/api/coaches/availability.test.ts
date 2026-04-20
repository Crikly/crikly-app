jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    getAll: () => [],
    set: jest.fn(),
  })),
}))

import { createServerClient } from '@supabase/ssr'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(request as any)
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

describe('POST /api/coaches/availability — overlap detection', () => {
  it('returns 409 when new slot overlaps existing slot', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    // Per-call mock: auth passes, then overlap check returns a conflict
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
        // coach_profiles upsert
        c.single.mockResolvedValue({ data: { id: 'coach-uuid' }, error: null })
        return c
      })
      .mockImplementationOnce(() => {
        // availability_templates conflict check — ends with .is('sport_id', null) when no sport_id provided
        const c = makeChain()
        c.is = jest.fn(() => Promise.resolve({
          data: [{ id: 'existing-slot-uuid', start_time: '08:00:00', end_time: '11:00:00', sports: null }],
          error: null,
        }))
        return c
      })

    const res = await callPost({ day_of_week: 1, start_time: '09:00', end_time: '10:00' })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.conflicting_block_id).toBe('existing-slot-uuid')
  })
})
