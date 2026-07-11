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
// BUG-33: the route routes by canonical user_profiles state (same gate as
// login) after the password save — mock the chainable from().select().eq()
// .single() the same way login.test.ts does.
const mockSingle = jest.fn()
const mockFrom = jest.fn(() => {
  const c: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq']) c[m] = jest.fn(() => c)
  c.single = mockSingle
  return c
})
const mockSupabase = {
  auth: { getUser: mockGetUser, updateUser: mockUpdateUser },
  from: mockFrom,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
})

async function callResetPassword(body: Record<string, unknown>) {
  jest.resetModules()
  jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn().mockReturnValue(mockSupabase) }))
  jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({ getAll: () => [], set: jest.fn() })) }))
  const { POST } = await import('@/app/api/auth/reset-password/route')
  const request = new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(request)
}

function mockAuthedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-123' } },
    error: null,
  })
}

describe('POST /api/auth/reset-password', () => {
  it('returns 400 when password is missing', async () => {
    const res = await callResetPassword({})
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = await callResetPassword({ password: 'short.7' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.code).toBe('VALIDATION_ERROR')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('returns 401 SESSION_EXPIRED when no recovery session exists', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth session missing!' },
    })
    const res = await callResetPassword({ password: 'newpassword1' })
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error.code).toBe('SESSION_EXPIRED')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('returns 422 SAME_PASSWORD when the new password equals the old one', async () => {
    mockAuthedUser()
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'New password should be different from the old password.' },
    })
    const res = await callResetPassword({ password: 'newpassword1' })
    expect(res.status).toBe(422)
    const data = await res.json()
    expect(data.error.code).toBe('SAME_PASSWORD')
  })

  it('returns 500 on any other update failure', async () => {
    mockAuthedUser()
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Database error' },
    })
    const res = await callResetPassword({ password: 'newpassword1' })
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error.code).toBe('UNKNOWN_ERROR')
  })

  it('saves the password and routes an onboarded coach to /coach/dashboard', async () => {
    mockAuthedUser()
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockSingle.mockResolvedValue({
      data: { active_role: 'coach', terms_accepted_at: '2026-01-01T00:00:00Z' },
      error: null,
    })
    const res = await callResetPassword({ password: 'newpassword1' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.redirectTo).toBe('/coach/dashboard')
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword1' })
  })

  it('routes to /onboarding/terms when terms are not yet accepted', async () => {
    mockAuthedUser()
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockSingle.mockResolvedValue({
      data: { active_role: 'coach', terms_accepted_at: null },
      error: null,
    })
    const res = await callResetPassword({ password: 'newpassword1' })
    const data = await res.json()
    expect(data.redirectTo).toBe('/onboarding/terms')
  })

  it('routes to /dashboard for a non-coach role', async () => {
    mockAuthedUser()
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockSingle.mockResolvedValue({
      data: { active_role: 'parent', terms_accepted_at: '2026-01-01T00:00:00Z' },
      error: null,
    })
    const res = await callResetPassword({ password: 'newpassword1' })
    const data = await res.json()
    expect(data.redirectTo).toBe('/dashboard')
  })

  it('routes to /onboarding/role when the profile row is missing (BUG-26 recovery lives there)', async () => {
    mockAuthedUser()
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })
    const res = await callResetPassword({ password: 'newpassword1' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.redirectTo).toBe('/onboarding/role')
  })
})
