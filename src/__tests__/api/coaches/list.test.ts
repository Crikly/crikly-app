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
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'gte', 'lte', 'or', 'order', 'limit', 'upsert', 'insert', 'update', 'filter']) {
    c[m] = jest.fn(() => c)
  }
  c.single = jest.fn()
  c.maybeSingle = jest.fn()
  c.returns = jest.fn()
  return c
}

const mockFrom = jest.fn()
const mockSupabase = { from: mockFrom }

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(query = '') {
  const url = `http://localhost/api/coaches${query}`
  const req = new Request(url) as Request & { nextUrl: URL }
  req.nextUrl = new URL(url)
  return req
}

async function callGet(query = '') {
  const { GET } = await import('@/app/api/coaches/route')
  return GET(makeRequest(query) as Parameters<typeof GET>[0])
}

// ─── Query param validation ───────────────────────────────────────────────────

describe('GET /api/coaches — query param validation', () => {
  it('returns 400 when only location_lat is provided without location_lng', async () => {
    const res = await callGet('?location_lat=51.5')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('location_lng')]))
  })

  it('returns 400 when radius_km is out of range', async () => {
    const res = await callGet('?radius_km=0')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('radius_km')]))
  })

  it('returns 400 when sort is an invalid value', async () => {
    const res = await callGet('?sort=random')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('sort')]))
  })

  it('returns 400 when session_type is invalid', async () => {
    const res = await callGet('?session_type=private')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('session_type')]))
  })

  it('returns 400 when min_rating is out of range', async () => {
    const res = await callGet('?min_rating=6')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('min_rating')]))
  })
})

// ─── Success case ─────────────────────────────────────────────────────────────

describe('GET /api/coaches — success', () => {
  it('returns 200 with coaches array and pagination metadata', async () => {
    const c = makeChain()
    c.returns = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'coach-uuid-1',
          slug: 'alice-smith',
          bio: 'Coach bio',
          dbs_status: 'verified',
          is_featured: false,
          is_suspended: false,
          gender: 'female',
          rating_avg: 4.8,
          rating_count: 5,
          sessions_completed: 10,
          years_experience: 3,
          user_profiles: {
            full_name: 'Alice Smith',
            location_city: 'London',
            location_lat: 51.5,
            location_lng: -0.1,
          },
          coach_sports: [],
          coach_photos: [],
        },
      ],
      error: null,
    })
    mockFrom.mockReturnValue(c)

    const res = await callGet()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('coaches')
    expect(data).toHaveProperty('total')
    expect(data).toHaveProperty('page')
    expect(data).toHaveProperty('pages')
    expect(Array.isArray(data.coaches)).toBe(true)
  })

  it('returns empty array when no live coaches exist', async () => {
    const c = makeChain()
    c.returns = jest.fn().mockResolvedValue({ data: [], error: null })
    mockFrom.mockReturnValue(c)

    const res = await callGet()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.coaches).toHaveLength(0)
    expect(data.total).toBe(0)
  })
})
