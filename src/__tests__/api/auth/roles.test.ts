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
const mockUpdate = jest.fn()
const mockEq = jest.fn()
const mockFrom = jest.fn(() => ({ update: mockUpdate }))

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
  mockUpdate.mockReturnValue({ eq: mockEq })
  mockEq.mockResolvedValue({ error: null })
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
