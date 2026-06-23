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

const mockSignIn = jest.fn()
// Fix-JEST-01: AUTH-FIX-01 routes by canonical user_profiles state
// (active_role + terms_accepted_at), read via from().select().eq().single() —
// not by user_metadata. The mock now needs a chainable from() returning that
// row; each test sets mockSingle to the profile under test.
const mockSingle = jest.fn()
const mockFrom = jest.fn(() => {
  const c: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq']) c[m] = jest.fn(() => c)
  c.single = mockSingle
  return c
})
const mockSupabase = { auth: { signInWithPassword: mockSignIn }, from: mockFrom }

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
})

async function callLogin(body: Record<string, unknown>) {
  jest.resetModules()
  jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn().mockReturnValue(mockSupabase) }))
  jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({ getAll: () => [], set: jest.fn() })) }))
  const { POST } = await import('@/app/api/auth/login/route')
  const request = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(request)
}

describe('POST /api/auth/login', () => {
  it('returns 400 when email is missing', async () => {
    const res = await callLogin({ password: 'password123' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  it('returns 400 when password is missing', async () => {
    const res = await callLogin({ email: 'test@example.com' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  it('returns 401 for invalid credentials', async () => {
    mockSignIn.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials' },
    })
    const res = await callLogin({ email: 'test@example.com', password: 'wrongpass' })
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns 403 when email is not verified', async () => {
    mockSignIn.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Email not confirmed' },
    })
    const res = await callLogin({ email: 'test@example.com', password: 'password123' })
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error.code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('redirects to /onboarding/role when user has no role', async () => {
    mockSignIn.mockResolvedValue({
      data: {
        session: { access_token: 'token' },
        user: { id: 'user-123', user_metadata: {} },
      },
      error: null,
    })
    // AUTH-FIX-01: terms accepted (so not gated to /onboarding/terms) but no
    // active_role yet → /onboarding/role.
    mockSingle.mockResolvedValue({
      data: { active_role: null, terms_accepted_at: '2026-01-01T00:00:00Z' },
      error: null,
    })
    const res = await callLogin({ email: 'test@example.com', password: 'password123' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.redirectTo).toBe('/onboarding/role')
  })

  it('redirects to /dashboard when user has a role', async () => {
    mockSignIn.mockResolvedValue({
      data: {
        session: { access_token: 'token' },
        user: { id: 'user-123', user_metadata: {} },
      },
      error: null,
    })
    // AUTH-FIX-01: a non-coach role with terms accepted → /dashboard. (A coach
    // active_role would route to /coach/dashboard; parent/player → /dashboard.)
    mockSingle.mockResolvedValue({
      data: { active_role: 'parent', terms_accepted_at: '2026-01-01T00:00:00Z' },
      error: null,
    })
    const res = await callLogin({ email: 'parent@example.com', password: 'password123' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.redirectTo).toBe('/dashboard')
  })
})
