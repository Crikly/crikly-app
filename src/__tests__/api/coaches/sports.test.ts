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
  const { POST } = await import('@/app/api/coaches/sports/route')
  const request = new Request('http://localhost/api/coaches/sports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(request as any)
}

// ─── Auth guards ──────────────────────────────────────────────────────────────

describe('POST /api/coaches/sports — auth guards', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') })

    const res = await callPost({ sport_id: 'cricket-uuid', session_types: ['individual'], skill_levels: ['beginner'] })
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

    const res = await callPost({ sport_id: 'cricket-uuid', session_types: ['individual'], skill_levels: ['beginner'] })
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toContain('coach role required')
  })
})

// ─── POST validation ──────────────────────────────────────────────────────────

describe('POST /api/coaches/sports — validation', () => {
  function passAuth() {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    const chain = makeChain()
    mockFrom.mockReturnValue(chain)
    chain.single
      .mockResolvedValueOnce({ data: { id: 'profile-uuid' }, error: null })
      .mockResolvedValueOnce({ data: { role: 'coach' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'coach-uuid' }, error: null })
  }

  it('returns 400 when sport_id is missing', async () => {
    passAuth()
    const res = await callPost({ session_types: ['individual'], skill_levels: ['beginner'] })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('sport_id')]))
  })

  it('returns 400 when session_types is empty', async () => {
    passAuth()
    const res = await callPost({ sport_id: 'cricket-uuid', session_types: [], skill_levels: ['beginner'] })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('session_types')]))
  })

  it('returns 400 when session_types contains invalid value', async () => {
    passAuth()
    const res = await callPost({ sport_id: 'cricket-uuid', session_types: ['solo'], skill_levels: ['beginner'] })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('session_types')]))
  })

  it('returns 400 when skill_levels contains invalid value', async () => {
    passAuth()
    const res = await callPost({ sport_id: 'cricket-uuid', session_types: ['individual'], skill_levels: ['expert'] })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('skill_levels')]))
  })

  it('returns 400 when individual price is missing for individual session', async () => {
    passAuth()
    const res = await callPost({
      sport_id: 'cricket-uuid',
      session_types: ['individual'],
      skill_levels: ['beginner'],
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('price_individual_pence')]))
  })
})

// ─── POST group pricing (CF-PRICE-01) ────────────────────────────────────────

describe('POST /api/coaches/sports — group pricing (CF-PRICE-01)', () => {
  let chain: ReturnType<typeof makeChain>

  function passAuth() {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    chain = makeChain()
    mockFrom.mockReturnValue(chain)
    chain.single
      .mockResolvedValueOnce({ data: { id: 'profile-uuid' }, error: null })
      .mockResolvedValueOnce({ data: { role: 'coach' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'coach-uuid' }, error: null })
  }

  const groupBody = {
    sport_id: 'cricket-uuid',
    session_types: ['individual', 'group'],
    skill_levels: ['beginner'],
    price_individual_pence: 4000,
    max_group_size: 3,
    group_price_tiers: { '2': 4500, '3': 5500 },
  }

  it('returns 400 when group is enabled without any tiers', async () => {
    passAuth()
    const res = await callPost({ ...groupBody, group_price_tiers: undefined })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(
      expect.arrayContaining([expect.stringContaining('at least one group_price_tiers entry')])
    )
  })

  it('returns 400 when group is enabled without max_group_size', async () => {
    passAuth()
    const res = await callPost({ ...groupBody, max_group_size: undefined })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(
      expect.arrayContaining([expect.stringContaining('max_group_size must be a number between 2 and 6')])
    )
  })

  it('returns 400 for max_group_size above 6 (old 2-50 contract is gone)', async () => {
    passAuth()
    const res = await callPost({ ...groupBody, max_group_size: 10 })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(
      expect.arrayContaining([expect.stringContaining('max_group_size must be a number between 2 and 6')])
    )
  })

  it('returns 400 for a tier key above max_group_size', async () => {
    passAuth()
    const res = await callPost({
      ...groupBody,
      max_group_size: 3,
      group_price_tiers: { '2': 4500, '4': 6500 },
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(
      expect.arrayContaining([expect.stringContaining('must not exceed max_group_size')])
    )
  })

  it('returns 400 for non-integer tier pence', async () => {
    passAuth()
    const res = await callPost({ ...groupBody, group_price_tiers: { '2': 45.5 } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('integer pence')]))
  })

  it('returns 400 when tiers are sent without group in session_types', async () => {
    passAuth()
    const res = await callPost({
      sport_id: 'cricket-uuid',
      session_types: ['individual'],
      skill_levels: ['beginner'],
      price_individual_pence: 4000,
      group_price_tiers: { '2': 4500 },
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(
      expect.arrayContaining([expect.stringContaining("group_price_tiers requires 'group'")])
    )
  })

  it('upserts tiers and cap when group is enabled', async () => {
    passAuth()
    chain.single
      .mockResolvedValueOnce({ data: { id: 'cricket-uuid' }, error: null }) // sport exists
      .mockResolvedValueOnce({
        data: {
          id: 'cs-uuid',
          sport_id: 'cricket-uuid',
          session_types: ['individual', 'group'],
          skill_levels: ['beginner'],
          age_groups: [],
          price_individual_pence: 4000,
          price_group_pence: null,
          max_group_size: 3,
          group_price_tiers: { '2': 4500, '3': 5500 },
          session_duration_minutes: 60,
          currency: 'GBP',
          is_active: true,
        },
        error: null,
      }) // coach_sports upsert
      .mockResolvedValueOnce({ data: { name: 'Cricket', slug: 'cricket' }, error: null }) // sport name

    const res = await callPost(groupBody)
    expect(res.status).toBe(201)
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ max_group_size: 3, group_price_tiers: { '2': 4500, '3': 5500 } }),
      expect.anything()
    )
    const data = await res.json()
    expect(data.group_price_tiers).toEqual({ '2': 4500, '3': 5500 })
  })

  it('force-nulls group fields when group is not enabled (unchecking clears stale tiers)', async () => {
    passAuth()
    chain.single
      .mockResolvedValueOnce({ data: { id: 'cricket-uuid' }, error: null }) // sport exists
      .mockResolvedValueOnce({
        data: {
          id: 'cs-uuid',
          sport_id: 'cricket-uuid',
          session_types: ['individual'],
          skill_levels: ['beginner'],
          age_groups: [],
          price_individual_pence: 4000,
          price_group_pence: null,
          max_group_size: null,
          group_price_tiers: null,
          session_duration_minutes: 60,
          currency: 'GBP',
          is_active: true,
        },
        error: null,
      }) // coach_sports upsert
      .mockResolvedValueOnce({ data: { name: 'Cricket', slug: 'cricket' }, error: null }) // sport name

    const res = await callPost({
      sport_id: 'cricket-uuid',
      session_types: ['individual'],
      skill_levels: ['beginner'],
      price_individual_pence: 4000,
    })
    expect(res.status).toBe(201)
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ max_group_size: null, group_price_tiers: null }),
      expect.anything()
    )
  })
})

// ─── PATCH group pricing (CF-PRICE-01) ───────────────────────────────────────

describe('PATCH /api/coaches/sports/[sportId] — group pricing (CF-PRICE-01)', () => {
  let chain: ReturnType<typeof makeChain>

  async function callPatch(body: Record<string, unknown>) {
    const { PATCH } = await import('@/app/api/coaches/sports/[sportId]/route')
    const request = new Request('http://localhost/api/coaches/sports/cs-uuid', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return PATCH(request as any, { params: Promise.resolve({ sportId: 'cs-uuid' }) })
  }

  function passAuthAndOwnership(existing: Record<string, unknown>) {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    chain = makeChain()
    mockFrom.mockReturnValue(chain)
    chain.single
      .mockResolvedValueOnce({ data: { id: 'profile-uuid' }, error: null })
      .mockResolvedValueOnce({ data: { role: 'coach' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'coach-uuid' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'cs-uuid', sport_id: 'cricket-uuid', ...existing }, error: null })
  }

  const groupRow = {
    session_types: ['individual', 'group'],
    max_group_size: 3,
    group_price_tiers: { '2': 4500, '3': 5500 },
  }

  it('does not 400 an unrelated PATCH on a legacy row with group in session_types but null tiers', async () => {
    // Pre-P-02 rows exist with 'group' in session_types and no group data.
    // A PATCH that touches no group field must not be held to group rules.
    passAuthAndOwnership({
      session_types: ['individual', 'group'],
      max_group_size: null,
      group_price_tiers: null,
    })
    chain.single
      .mockResolvedValueOnce({
        data: {
          id: 'cs-uuid',
          sport_id: 'cricket-uuid',
          session_types: ['individual', 'group'],
          skill_levels: ['beginner'],
          price_individual_pence: 4000,
          price_group_pence: null,
          max_group_size: null,
          group_price_tiers: null,
          session_duration_minutes: 60,
          currency: 'GBP',
          is_active: false,
        },
        error: null,
      }) // update
      .mockResolvedValueOnce({ data: { name: 'Cricket', slug: 'cricket' }, error: null }) // sport name

    const res = await callPatch({ is_active: false })
    expect(res.status).toBe(200)
    // The untouched group state must not be mutated by an unrelated PATCH.
    expect(chain.update.mock.calls[0][0]).not.toHaveProperty('group_price_tiers')
    expect(chain.update.mock.calls[0][0]).not.toHaveProperty('max_group_size')
  })

  it('returns 400 when enabling group on a row that has no tiers', async () => {
    passAuthAndOwnership({ session_types: ['individual'], max_group_size: null, group_price_tiers: null })
    const res = await callPatch({ session_types: ['individual', 'group'] })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(
      expect.arrayContaining([expect.stringContaining('at least one group_price_tiers entry')])
    )
  })

  it('returns 400 when shrinking max_group_size below an existing tier key', async () => {
    passAuthAndOwnership(groupRow)
    const res = await callPatch({ max_group_size: 2 })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(
      expect.arrayContaining([expect.stringContaining('must not exceed max_group_size')])
    )
  })

  it('returns 400 when tiers are sent while group is disabled', async () => {
    passAuthAndOwnership({ session_types: ['individual'], max_group_size: null, group_price_tiers: null })
    const res = await callPatch({ group_price_tiers: { '2': 4500 } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(
      expect.arrayContaining([expect.stringContaining("group_price_tiers requires 'group'")])
    )
  })

  it('auto-clears group data when a PATCH disables group', async () => {
    passAuthAndOwnership(groupRow)
    chain.single
      .mockResolvedValueOnce({
        data: {
          id: 'cs-uuid',
          sport_id: 'cricket-uuid',
          session_types: ['individual'],
          skill_levels: ['beginner'],
          price_individual_pence: 4000,
          price_group_pence: null,
          max_group_size: null,
          group_price_tiers: null,
          session_duration_minutes: 60,
          currency: 'GBP',
          is_active: true,
        },
        error: null,
      }) // update
      .mockResolvedValueOnce({ data: { name: 'Cricket', slug: 'cricket' }, error: null }) // sport name

    const res = await callPatch({ session_types: ['individual'] })
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ max_group_size: null, group_price_tiers: null })
    )
  })

  it('accepts a coherent full group update', async () => {
    passAuthAndOwnership(groupRow)
    chain.single
      .mockResolvedValueOnce({
        data: {
          id: 'cs-uuid',
          sport_id: 'cricket-uuid',
          session_types: ['individual', 'group'],
          skill_levels: ['beginner'],
          price_individual_pence: 4000,
          price_group_pence: null,
          max_group_size: 4,
          group_price_tiers: { '2': 4500, '4': 7000 },
          session_duration_minutes: 60,
          currency: 'GBP',
          is_active: true,
        },
        error: null,
      }) // update
      .mockResolvedValueOnce({ data: { name: 'Cricket', slug: 'cricket' }, error: null }) // sport name

    const res = await callPatch({ max_group_size: 4, group_price_tiers: { '2': 4500, '4': 7000 } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.group_price_tiers).toEqual({ '2': 4500, '4': 7000 })
    expect(data.max_group_size).toBe(4)
  })
})
