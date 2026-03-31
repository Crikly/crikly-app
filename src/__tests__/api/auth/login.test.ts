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
const mockSupabase = { auth: { signInWithPassword: mockSignIn } }

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
        user: { user_metadata: {} },
      },
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
        user: { user_metadata: { primary_role: 'coach' } },
      },
      error: null,
    })
    const res = await callLogin({ email: 'coach@example.com', password: 'password123' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.redirectTo).toBe('/dashboard')
  })
})
