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
