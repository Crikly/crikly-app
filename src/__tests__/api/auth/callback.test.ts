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
import { NextResponse } from 'next/server'
import { GET } from '@/app/auth/callback/route'

const mockExchange = jest.fn()
const mockGetUser = jest.fn()
const mockSingle = jest.fn()
const mockUpsert = jest.fn()
const mockFrom = jest.fn(() => {
  const c: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq']) c[m] = jest.fn(() => c)
  c.single = mockSingle
  c.upsert = mockUpsert
  return c
})
const mockSupabase = {
  auth: { exchangeCodeForSession: mockExchange, getUser: mockGetUser },
  from: mockFrom,
}

// The jest.setup.ts Headers/Request polyfills drop the Location header that
// NextResponse.redirect sets, so capture the redirect target via a spy instead
// of reading response headers.
let redirectSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
  mockUpsert.mockResolvedValue({ error: null })
  redirectSpy = jest.spyOn(NextResponse, 'redirect').mockImplementation(
    (url) => ({ status: 307, url: url.toString() }) as unknown as NextResponse
  )
})

afterEach(() => {
  redirectSpy.mockRestore()
})

async function callCallback(query: string) {
  const request = new Request(`http://localhost/auth/callback${query}`)
  await GET(request)
  const lastCall = redirectSpy.mock.calls[redirectSpy.mock.calls.length - 1]
  const url = new URL(lastCall[0].toString())
  return url.pathname + url.search
}

function mockAuthedUser() {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'user-123',
        user_metadata: { full_name: 'Test Coach' },
        app_metadata: { provider: 'google' },
      },
    },
    error: null,
  })
}

describe('GET /auth/callback — recovery flow (BUG-33)', () => {
  it('redirects an expired recovery link (no code) to /forgot-password?error=link_expired', async () => {
    const target = await callCallback('?type=recovery&error=access_denied&error_code=otp_expired')
    expect(target).toBe('/forgot-password?error=link_expired')
  })

  it('redirects a failed recovery code exchange to /forgot-password?error=link_expired', async () => {
    mockExchange.mockResolvedValue({ error: { message: 'invalid code' } })
    const target = await callCallback('?code=abc&type=recovery')
    expect(target).toBe('/forgot-password?error=link_expired')
  })

  it('redirects a successful recovery exchange to /reset-password before any profile routing', async () => {
    mockExchange.mockResolvedValue({ error: null })
    const target = await callCallback('?code=abc&type=recovery')
    expect(target).toBe('/reset-password')
    // The recovery branch must not run the profile upsert or the routing gate.
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})

describe('GET /auth/callback — normal flow (regression)', () => {
  it('redirects to /login when no code is present', async () => {
    const target = await callCallback('')
    expect(target).toBe('/login')
  })

  it('redirects to /login?error=oauth_failed when the exchange fails', async () => {
    mockExchange.mockResolvedValue({ error: { message: 'bad code' } })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/login?error=oauth_failed')
  })

  it('routes an onboarded coach to /coach/dashboard', async () => {
    mockExchange.mockResolvedValue({ error: null })
    mockAuthedUser()
    mockSingle.mockResolvedValue({
      data: { active_role: 'coach', terms_accepted_at: '2026-01-01T00:00:00Z' },
      error: null,
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/coach/dashboard')
  })

  it('routes a genuinely new user (no active_role) to /onboarding/role — Fix-11i path', async () => {
    mockExchange.mockResolvedValue({ error: null })
    mockAuthedUser()
    mockSingle.mockResolvedValue({
      data: { active_role: null, terms_accepted_at: null },
      error: null,
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/onboarding/role')
  })

  it('routes to /onboarding/terms when a role exists but terms are not accepted', async () => {
    mockExchange.mockResolvedValue({ error: null })
    mockAuthedUser()
    mockSingle.mockResolvedValue({
      data: { active_role: 'coach', terms_accepted_at: null },
      error: null,
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/onboarding/terms')
  })
})
