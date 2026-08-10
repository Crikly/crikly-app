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

const mockSignInWithOAuth = jest.fn()
const mockSupabase = { auth: { signInWithOAuth: mockSignInWithOAuth } }

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
  mockSignInWithOAuth.mockResolvedValue({
    data: { url: 'https://accounts.google.com/auth' },
    error: null,
  })
})

async function callOAuth(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/auth/oauth/route')
  const request = new Request('http://localhost/api/auth/oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  })
  return POST(request)
}

describe('POST /api/auth/oauth', () => {
  it('rejects an invalid provider', async () => {
    const res = await callOAuth({ provider: 'facebook' })
    expect(res.status).toBe(400)
  })

  // P-04-B (AUTH-FLOW-01): validated role rides the OAuth redirectTo so it
  // survives the round-trip on the callback URL.
  it('threads a valid role onto redirectTo', async () => {
    await callOAuth({ provider: 'google', role: 'parent' })
    const options = mockSignInWithOAuth.mock.calls[0][0].options
    expect(options.redirectTo).toBe('http://localhost:3000/auth/callback?role=parent')
  })

  it('silently drops an invalid role (validated-null short-circuit)', async () => {
    const res = await callOAuth({ provider: 'google', role: 'hacker' })
    expect(res.status).toBe(200)
    const options = mockSignInWithOAuth.mock.calls[0][0].options
    expect(options.redirectTo).toBe('http://localhost:3000/auth/callback')
  })

  it('builds a bare redirectTo when no role is sent — behaviour unchanged', async () => {
    await callOAuth({ provider: 'google' })
    const options = mockSignInWithOAuth.mock.calls[0][0].options
    expect(options.redirectTo).toBe('http://localhost:3000/auth/callback')
  })
})
