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
  const { POST } = await import('@/app/api/coaches/blocked-dates/route')
  const request = new Request('http://localhost/api/coaches/blocked-dates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(request as any)
}

// ─── Auth guards ──────────────────────────────────────────────────────────────

describe('POST /api/coaches/blocked-dates — auth guards', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') })

    const res = await callPost({ blocked_date: '2026-06-01' })
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

    const res = await callPost({ blocked_date: '2026-06-01' })
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toContain('coach role required')
  })
})

// ─── POST validation ──────────────────────────────────────────────────────────

describe('POST /api/coaches/blocked-dates — validation', () => {
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

  it('returns 400 when blocked_date is missing', async () => {
    passAuth()
    const res = await callPost({})
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('blocked_date')]))
  })

  it('returns 400 when blocked_date is in the past', async () => {
    passAuth()
    const res = await callPost({ blocked_date: '2020-01-01' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('past')]))
  })

  it('returns 400 when blocked_date_end is before blocked_date', async () => {
    passAuth()
    // Fix-JEST-01: dynamic future dates so the past-date guard isn't co-triggered;
    // end is 5 days before start (both future) → isolates the blocked_date_end error.
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const base = new Date(); base.setMonth(base.getMonth() + 3)
    const start = fmt(base)
    const end = fmt(new Date(base.getTime() - 5 * 86400000))
    const res = await callPost({ blocked_date: start, blocked_date_end: end })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('blocked_date_end')]))
  })

  it('returns 400 when label exceeds 100 characters', async () => {
    passAuth()
    // Fix-JEST-01: dynamic future date so only the label error is asserted.
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const base = new Date(); base.setMonth(base.getMonth() + 3)
    const res = await callPost({ blocked_date: fmt(base), label: 'x'.repeat(101) })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('label')]))
  })
})

// ─── Overlap detection ────────────────────────────────────────────────────────

describe('POST /api/coaches/blocked-dates — overlap detection', () => {
  it('returns 409 when new date overlaps an existing blocked period', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    // Fix-JEST-01: dynamic dates ~3 months ahead so the test never ages into the
    // route's past-date guard (which would 400 before the overlap check). The new
    // date sits inside an existing block spanning [base-3d, base+3d] → overlap.
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const base = new Date()
    base.setMonth(base.getMonth() + 3)
    const blockStart = new Date(base); blockStart.setDate(blockStart.getDate() - 3)
    const blockEnd = new Date(base); blockEnd.setDate(blockEnd.getDate() + 3)
    const newDate = fmt(base)

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
        // existing blocked_dates — overlapping period
        const c = makeChain()
        c.eq = jest.fn(() => Promise.resolve({
          data: [{
            id: 'existing-block-uuid',
            blocked_date: fmt(blockStart),
            blocked_date_end: fmt(blockEnd),
            label: 'Holiday',
          }],
          error: null,
        }))
        return c
      })

    const res = await callPost({ blocked_date: newDate })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.conflicting_block_id).toBe('existing-block-uuid')
  })
})
