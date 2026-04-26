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

async function callGet() {
  const { GET } = await import('@/app/api/coaches/profile/route')
  const request = new Request('http://localhost/api/coaches/profile')
  return GET()
}

async function callPost(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/coaches/profile/route')
  const request = new Request('http://localhost/api/coaches/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(request as any)
}

// ─── Auth guards ──────────────────────────────────────────────────────────────

describe('GET /api/coaches/profile — auth guards', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') })

    const res = await callGet()
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

    const res = await callGet()
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toContain('coach role required')
  })
})

describe('POST /api/coaches/profile — auth guards', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') })

    const res = await callPost({ bio: 'Hello' })
    expect(res.status).toBe(401)
  })

  it('returns 403 when user has no coach role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    const chain = makeChain()
    mockFrom.mockReturnValue(chain)
    chain.single
      .mockResolvedValueOnce({ data: { id: 'profile-uuid' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('not found') })

    const res = await callPost({ bio: 'Hello' })
    expect(res.status).toBe(403)
  })
})

// ─── POST validation ──────────────────────────────────────────────────────────

describe('POST /api/coaches/profile — validation', () => {
  function passAuth() {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    const chain = makeChain()
    mockFrom.mockReturnValue(chain)
    chain.single
      .mockResolvedValueOnce({ data: { id: 'profile-uuid', auth_user_id: 'user-123' }, error: null })
      .mockResolvedValueOnce({ data: { role: 'coach' }, error: null })
  }

  it('returns 400 when bio exceeds 500 characters', async () => {
    passAuth()
    const res = await callPost({ bio: 'x'.repeat(501) })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Validation failed')
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('bio')]))
  })

  it('returns 400 when years_experience is out of range', async () => {
    passAuth()
    const res = await callPost({ years_experience: 51 })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('years_experience')]))
  })

  it('returns 400 when gender is invalid', async () => {
    passAuth()
    const res = await callPost({ gender: 'unknown' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('gender')]))
  })

  it('returns 400 when cancellation_window_hours is not an allowed value', async () => {
    passAuth()
    const res = await callPost({ cancellation_window_hours: 6 })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('cancellation_window_hours')]))
  })
})
