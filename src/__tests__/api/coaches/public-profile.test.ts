// Public profile route uses two Supabase clients:
// 1. createClient() from @/lib/supabase/server — uses @supabase/ssr
// 2. createClient from @supabase/supabase-js — service-role admin client (module-level)

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    getAll: () => [],
    set: jest.fn(),
  })),
}))

// The admin client is created at module level in the route:
// const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY)
// We mock @supabase/supabase-js so createClient returns our mockAdminClient.
const mockAdminFrom = jest.fn()
const mockAdminClient = { from: mockAdminFrom }

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockAdminClient),
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
const COACH_SLUG = 'john-doe'

async function callGet(id: string) {
  const { GET } = await import('@/app/api/coaches/[id]/route')
  const request = new Request(`http://localhost/api/coaches/${id}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return GET(request as any, { params: Promise.resolve({ id }) })
}

function mockCoachProfileQuery(returnId: string, displayName: string | null = null) {
  const c = makeChain()
  c.maybeSingle.mockResolvedValue({
    data: {
      id: returnId,
      user_profile_id: 'user-profile-uuid',
      display_name: displayName,
      bio: 'Test bio',
      years_experience: 5,
      dbs_status: 'verified',
      dbs_verified_at: null,
      dbs_expires_at: null,
      is_featured: false,
      gender: 'male',
      languages: ['English'],
      rating_avg: 4.5,
      rating_count: 10,
      sessions_completed: 20,
      cancellation_window_hours: 24,
      min_advance_hours: 12,
      max_advance_days: 60,
      coach_sports: [],
      coach_qualifications: [],
      coach_photos: [],
      availability_templates: [],
    },
    error: null,
  })
  return c
}

function mockUserProfileQuery() {
  const c = makeChain()
  c.single.mockResolvedValue({
    data: { full_name: 'John Doe', location_city: 'London', location_lat: 51.5, location_lng: -0.1, avatar_url: null },
    error: null,
  })
  return c
}

function mockReviewsQuery(reviewsEqSpy?: jest.Mock) {
  const c = makeChain()
  c.eq = reviewsEqSpy ?? jest.fn(() => c)
  c.limit = jest.fn(() => Promise.resolve({ data: [], error: null }))
  c.order = jest.fn(() => c)
  return c
}

// ─── 404 — not found ──────────────────────────────────────────────────────────

describe('GET /api/coaches/[id] — not found', () => {
  it('returns 404 when coach does not exist', async () => {
    const c = makeChain()
    c.maybeSingle.mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue(c)

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toContain('not found')
  })
})

// ─── Fix-47 regression ────────────────────────────────────────────────────────
//
// When the route is called with a SLUG, coach_profiles is queried by slug column.
// The resolved coach.id (UUID) must be used for the reviews query — not the raw slug.
// Previously this bug caused reviews to be queried with .eq('coach_profile_id', slug)
// which never returns results.

describe('Fix-47 regression: reviews query uses resolved UUID, not raw slug', () => {
  it('queries reviews by coach UUID when route is called with a slug', async () => {
    const reviewsEqCalls: Array<[string, string]> = []

    // coach_profiles — called first, queried by .eq('slug', COACH_SLUG), resolves COACH_UUID
    mockFrom.mockImplementationOnce(() => mockCoachProfileQuery(COACH_UUID))

    mockAdminFrom.mockImplementationOnce(() => mockUserProfileQuery())

    // reviews query — second mockFrom call (sports/qualTypes skipped since coach_sports/quals are empty)
    // Capture all .eq() calls to verify coach_profile_id uses UUID not slug
    mockFrom.mockImplementationOnce(() => {
      const c = makeChain()
      c.eq = jest.fn((col: string, val: string) => {
        reviewsEqCalls.push([col, val])
        return c  // return chain so further .eq()/.order()/.limit() continue chaining
      })
      c.order = jest.fn(() => c)
      c.limit = jest.fn(() => Promise.resolve({ data: [], error: null }))
      return c
    })

    const res = await callGet(COACH_SLUG)
    expect(res.status).toBe(200)

    // Find the call where coach_profile_id was set
    const coachIdCall = reviewsEqCalls.find(([col]) => col === 'coach_profile_id')
    expect(coachIdCall).toBeDefined()

    const usedId = coachIdCall![1]
    expect(usedId).toBe(COACH_UUID)   // ✅ must be the resolved UUID
    expect(usedId).not.toBe(COACH_SLUG)  // ❌ must NOT be the raw slug
  })
})

// ─── BUG-37 regression ────────────────────────────────────────────────────────
//
// Public surfaces must show coach_profiles.display_name, never the account
// holder's user_profiles.full_name (which can differ — e.g. a coach persona on
// a personal account). The response key stays `full_name` for consumers; only
// the source changes. Fallback to user_profiles.full_name when display_name is
// null (coach hasn't completed wizard step 1).

describe('BUG-37 regression: full_name prefers coach display_name', () => {
  it('returns display_name when set on the coach profile', async () => {
    mockFrom.mockImplementationOnce(() => mockCoachProfileQuery(COACH_UUID, 'Alex Stuart'))
    mockAdminFrom.mockImplementationOnce(() => mockUserProfileQuery())
    mockFrom.mockImplementationOnce(() => mockReviewsQuery())

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.full_name).toBe('Alex Stuart')      // ✅ public display name
    expect(data.full_name).not.toBe('John Doe')     // ❌ not the account name
  })

  it('falls back to user_profiles.full_name when display_name is null', async () => {
    mockFrom.mockImplementationOnce(() => mockCoachProfileQuery(COACH_UUID, null))
    mockAdminFrom.mockImplementationOnce(() => mockUserProfileQuery())
    mockFrom.mockImplementationOnce(() => mockReviewsQuery())

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.full_name).toBe('John Doe')
  })
})
