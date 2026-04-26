// Fix-51 regression: GET /api/coaches/[id]/availability uses .eq('id', id) directly.
// A non-UUID string (slug) cannot match a UUID primary key, so the coach is not found.
// The route must return 404 when called with a slug instead of a UUID.

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

const mockFrom = jest.fn()
const mockSupabase = { from: mockFrom }

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COACH_UUID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff'

function makeRequest(id: string, query = '') {
  const url = `http://localhost/api/coaches/${id}/availability${query}`
  const req = new Request(url) as Request & { nextUrl: URL }
  req.nextUrl = new URL(url)
  return req
}

async function callGet(id: string, query = '') {
  const { GET } = await import('@/app/api/coaches/[id]/availability/route')
  return GET(makeRequest(id, query) as Parameters<typeof GET>[0], { params: Promise.resolve({ id }) })
}

// ─── Fix-51 regression ────────────────────────────────────────────────────────

describe('Fix-51 regression: slug passed to availability API returns 404', () => {
  it('returns 404 when called with a slug instead of UUID', async () => {
    // Route queries .eq('id', id) directly — a slug cannot match a UUID column
    const c = makeChain()
    c.maybeSingle.mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue(c)

    const res = await callGet('john-doe')
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toContain('not found')
  })
})

// ─── Query param validation ───────────────────────────────────────────────────

describe('GET /api/coaches/[id]/availability — query param validation', () => {
  it('returns 400 when from_date has invalid format', async () => {
    const res = await callGet(COACH_UUID, '?from_date=01-06-2026')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('from_date')]))
  })

  it('returns 400 when from_date is after to_date', async () => {
    const res = await callGet(COACH_UUID, '?from_date=2026-06-10&to_date=2026-06-01')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('from_date')]))
  })
})

// ─── Success case ─────────────────────────────────────────────────────────────

describe('GET /api/coaches/[id]/availability — success', () => {
  it('returns 200 with availability data when called with a valid UUID', async () => {
    mockFrom
      .mockImplementationOnce(() => {
        // coach_profiles — verify coach is live
        const c = makeChain()
        c.maybeSingle.mockResolvedValue({
          data: { cancellation_window_hours: 24, min_advance_hours: 12, max_advance_days: 60 },
          error: null,
        })
        return c
      })
      .mockImplementationOnce(() => {
        // availability_templates — .select().eq('coach_profile_id').eq('is_active') then awaited
        const c = makeChain()
        let eqCount = 0
        c.eq = jest.fn(() => {
          eqCount++
          if (eqCount >= 2) {
            return Promise.resolve({
              data: [{ id: 'slot-uuid', sport_id: null, day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_active: true }],
              error: null,
            })
          }
          return c
        })
        return c
      })
      .mockImplementationOnce(() => {
        // blocked_dates — .select().eq('coach_profile_id') then awaited (single eq)
        const c = makeChain()
        c.eq = jest.fn(() => Promise.resolve({ data: [], error: null }))
        return c
      })

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('availability')
    expect(data).toHaveProperty('blocked_dates')
    expect(data).toHaveProperty('booking_policy')
    expect(data.booking_policy.cancellation_window_hours).toBe(24)
  })
})
