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

const mockGetUser = jest.fn()
const mockUpdateUser = jest.fn()

// Fix-JEST-01: chainable Supabase mock. The route (Fix-12 + Fix-ROLES-01) calls
// user_profiles.select('id').eq().single(), user_profiles.update().eq(),
// user_roles.upsert(), and (coach) coach_profiles.upsert(). Every chain method
// returns the chain; .single() resolves the user_profile id. Awaiting a chain
// that doesn't end in .single() yields the chain object itself, whose `error`
// is undefined — so the route's `{ error } = await ...` checks see no error.
function makeChain() {
  const c: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq', 'update', 'upsert', 'insert']) {
    c[m] = jest.fn(() => c)
  }
  c.single = jest.fn().mockResolvedValue({ data: { id: 'profile-123' }, error: null })
  return c
}
const mockFrom = jest.fn(() => makeChain())

const mockSupabase = {
  auth: {
    getUser: mockGetUser,
    updateUser: mockUpdateUser,
  },
  from: mockFrom,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
  mockUpdateUser.mockResolvedValue({ error: null })
  mockFrom.mockImplementation(() => makeChain())
})

async function callRoles(body: Record<string, unknown>) {
  jest.resetModules()
  jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn().mockReturnValue(mockSupabase) }))
  jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({ getAll: () => [], set: jest.fn() })) }))
  const { POST } = await import('@/app/api/auth/roles/route')
  const request = new Request('http://localhost/api/auth/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(request)
}

describe('POST /api/auth/roles', () => {
  it('returns 400 for missing role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123', user_metadata: {} } }, error: null })
    const res = await callRoles({})
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for invalid role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123', user_metadata: {} } }, error: null })
    const res = await callRoles({ role: 'admin' })
    expect(res.status).toBe(400)
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Not authenticated' } })
    const res = await callRoles({ role: 'parent' })
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 200 and saves parent role successfully', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', user_metadata: {} } },
      error: null,
    })
    const res = await callRoles({ role: 'parent' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.redirectTo).toBe('/onboarding/terms')
  })

  it('returns 200 and saves coach role successfully', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', user_metadata: {} } },
      error: null,
    })
    const res = await callRoles({ role: 'coach' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('accepts all three valid roles', async () => {
    for (const role of ['parent', 'player', 'coach']) {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', user_metadata: {} } },
        error: null,
      })
      const res = await callRoles({ role })
      expect(res.status).toBe(200)
    }
  })
})

// BUG-26: profile-recovery resilience. When the auth callback that normally
// creates user_profiles has failed, the role route must recover by creating the
// row from the authenticated session instead of stranding the user on a 500.
describe('POST /api/auth/roles — BUG-26 profile recovery', () => {
  // Records every table.method (and its args) the route issues, so tests can
  // assert whether — and how — a user_profiles recovery write was performed.
  // BUG-35 reshaped recovery to upsert-DO-NOTHING + follow-up SELECT, so the
  // user_profiles upsert resolves { error } directly, and single() serves the
  // initial fetch on its first call and the follow-up id fetch afterwards.
  type DbCall = { table?: string; method: string; args?: unknown[] }
  function trackingImpl(
    dbCalls: DbCall[],
    fetchResult: { data: unknown; error: unknown },
    recoveryUpsertResult: { error: unknown },
    recoveredFetchResult: { data: unknown; error: unknown },
  ) {
    let userProfilesSingleCalls = 0
    return (table?: string) => {
      const c: Record<string, jest.Mock> = {}
      for (const m of ['select', 'eq', 'update', 'insert']) {
        c[m] = jest.fn(() => {
          dbCalls.push({ table, method: m })
          return c
        })
      }
      c.upsert = jest.fn((...args: unknown[]) => {
        dbCalls.push({ table, method: 'upsert', args })
        if (table === 'user_profiles') {
          return Promise.resolve(recoveryUpsertResult)
        }
        return c
      })
      c.single = jest.fn(() => {
        if (table === 'user_profiles') {
          userProfilesSingleCalls += 1
          return Promise.resolve(
            userProfilesSingleCalls === 1 ? fetchResult : recoveredFetchResult,
          )
        }
        return Promise.resolve({ data: { id: 'profile-123' }, error: null })
      })
      return c
    }
  }

  const authedUser = {
    data: {
      user: {
        id: 'user-123',
        user_metadata: { full_name: 'Recovered User' },
        app_metadata: { provider: 'email' },
      },
    },
    error: null,
  }

  it('recovers by creating the profile row and returns redirectTo when the fetch finds none', async () => {
    mockGetUser.mockResolvedValue(authedUser)
    const dbCalls: DbCall[] = []
    mockFrom.mockImplementation(
      trackingImpl(
        dbCalls,
        { data: null, error: { code: 'PGRST116', message: 'no rows' } }, // fetch: not found
        { error: null }, // recovery upsert: success
        { data: { id: 'recovered-1' }, error: null }, // follow-up id fetch: success
      ),
    )

    const res = await callRoles({ role: 'coach' })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.redirectTo).toBe('/onboarding/terms')
    // Recovery write was issued against user_profiles.
    expect(
      dbCalls.some((c) => c.table === 'user_profiles' && c.method === 'upsert'),
    ).toBe(true)
  })

  it('recovery upsert is ON CONFLICT DO NOTHING — it can never overwrite an existing row (BUG-35)', async () => {
    mockGetUser.mockResolvedValue(authedUser)
    const dbCalls: DbCall[] = []
    mockFrom.mockImplementation(
      trackingImpl(
        dbCalls,
        // Transient fetch blip — the broad recovery trigger fires even though
        // a row exists. The write must be a no-op, not an overwrite.
        { data: null, error: { code: '57014', message: 'statement timeout' } },
        { error: null },
        { data: { id: 'profile-123' }, error: null }, // follow-up finds the existing row
      ),
    )

    const res = await callRoles({ role: 'coach' })

    expect(res.status).toBe(200)
    const recoveryUpsert = dbCalls.find(
      (c) => c.table === 'user_profiles' && c.method === 'upsert',
    )
    expect(recoveryUpsert).toBeDefined()
    expect(recoveryUpsert?.args?.[1]).toEqual({
      onConflict: 'auth_user_id',
      ignoreDuplicates: true,
    })
  })

  it('returns a clean error (no throw) when the recovery upsert itself fails', async () => {
    mockGetUser.mockResolvedValue(authedUser)
    const dbCalls: DbCall[] = []
    mockFrom.mockImplementation(
      trackingImpl(
        dbCalls,
        { data: null, error: { code: 'PGRST116', message: 'no rows' } }, // fetch: not found
        { error: { message: 'db unavailable' } }, // recovery upsert: fails
        { data: null, error: { message: 'should not be reached' } },
      ),
    )

    const res = await callRoles({ role: 'coach' })

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error.message).toBe('Could not create your profile. Please try again.')
  })

  it('returns a clean error when the follow-up id fetch after recovery fails', async () => {
    mockGetUser.mockResolvedValue(authedUser)
    const dbCalls: DbCall[] = []
    mockFrom.mockImplementation(
      trackingImpl(
        dbCalls,
        { data: null, error: { code: 'PGRST116', message: 'no rows' } }, // fetch: not found
        { error: null }, // recovery upsert: success
        { data: null, error: { message: 'db unavailable' } }, // follow-up fetch: fails
      ),
    )

    const res = await callRoles({ role: 'coach' })

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error.message).toBe('Could not create your profile. Please try again.')
  })

  it('happy path (profile exists) issues zero recovery upserts against user_profiles', async () => {
    mockGetUser.mockResolvedValue(authedUser)
    const dbCalls: DbCall[] = []
    mockFrom.mockImplementation(
      trackingImpl(
        dbCalls,
        { data: { id: 'profile-123' }, error: null }, // fetch: found
        { error: null },
        { data: { id: 'should-not-be-used' }, error: null },
      ),
    )

    const res = await callRoles({ role: 'coach' })

    expect(res.status).toBe(200)
    // No recovery write — the happy path must be byte-identical to before.
    expect(
      dbCalls.some((c) => c.table === 'user_profiles' && c.method === 'upsert'),
    ).toBe(false)
  })
})
