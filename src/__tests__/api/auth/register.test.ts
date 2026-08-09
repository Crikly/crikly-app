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

const mockSignUp = jest.fn()
const mockSupabase = { auth: { signUp: mockSignUp } }

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
})

async function callRegister(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/auth/register/route')
  const request = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(request)
}

describe('POST /api/auth/register', () => {
  it('returns 400 when fullName is missing', async () => {
    const res = await callRegister({ email: 'test@example.com', password: 'password123' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when email is missing', async () => {
    const res = await callRegister({ fullName: 'Test User', password: 'password123' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
  })

  it('returns 400 when password is too short', async () => {
    const res = await callRegister({ fullName: 'Test User', email: 'test@example.com', password: 'short' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.code).toBe('WEAK_PASSWORD')
  })

  it('returns 409 when email is already registered', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    })
    const res = await callRegister({ fullName: 'Test User', email: 'taken@example.com', password: 'password123' })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error.code).toBe('EMAIL_TAKEN')
  })

  it('returns 200 and redirectTo on successful registration', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    const res = await callRegister({ fullName: 'Test User', email: 'new@example.com', password: 'password123' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.redirectTo).toContain('/verify')
    expect(data.redirectTo).toContain('new%40example.com')
  })

  it('returns 500 when Supabase returns no user', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null },
      error: null,
    })
    const res = await callRegister({ fullName: 'Test User', email: 'ghost@example.com', password: 'password123' })
    expect(res.status).toBe(500)
  })
})

// P-04-B (AUTH-FLOW-01): validated ?role= rides the verify-email link.
describe('POST /api/auth/register — role param (P-04-B)', () => {
  const validBody = {
    fullName: 'Test Parent',
    email: 'parent@example.com',
    password: 'password123',
  }

  beforeEach(() => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
  })

  it('appends a valid role to emailRedirectTo', async () => {
    await callRegister({ ...validBody, role: 'parent' })
    const options = mockSignUp.mock.calls[0][0].options
    expect(options.emailRedirectTo).toMatch(/\/auth\/callback\?role=parent$/)
  })

  it('silently drops an invalid role (validated-null short-circuit)', async () => {
    const res = await callRegister({ ...validBody, role: 'admin"><script>' })
    expect(res.status).toBe(200)
    const options = mockSignUp.mock.calls[0][0].options
    expect(options.emailRedirectTo).toMatch(/\/auth\/callback$/)
  })

  it('omits the param when no role is sent — behaviour unchanged', async () => {
    await callRegister(validBody)
    const options = mockSignUp.mock.calls[0][0].options
    expect(options.emailRedirectTo).toMatch(/\/auth\/callback$/)
  })
})
