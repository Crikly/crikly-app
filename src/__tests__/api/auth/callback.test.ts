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
// BUG-35: records gap-fill payloads. The route awaits update().eq() as a
// chain, so the inner fn returns the chain (whose `error` is undefined —
// success) while mockUpdate captures the payload for assertions.
const mockUpdate = jest.fn()
const mockFrom = jest.fn(() => {
  const c: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq']) c[m] = jest.fn(() => c)
  c.single = mockSingle
  c.upsert = mockUpsert
  c.update = jest.fn((payload: Record<string, unknown>) => {
    mockUpdate(payload)
    return c
  })
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

function mockAuthedUser(userMetadata: Record<string, unknown> = { full_name: 'Test Coach' }) {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'user-123',
        user_metadata: userMetadata,
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
      data: {
        active_role: 'coach',
        terms_accepted_at: '2026-01-01T00:00:00Z',
        full_name: 'Test Coach',
        avatar_url: 'https://cdn.example/own-photo.png',
      },
      error: null,
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/coach/dashboard')
  })

  it('routes an existing row with no active_role to /onboarding/role', async () => {
    mockExchange.mockResolvedValue({ error: null })
    mockAuthedUser()
    mockSingle.mockResolvedValue({
      data: { active_role: null, terms_accepted_at: null, full_name: 'Test Coach', avatar_url: null },
      error: null,
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/onboarding/role')
  })

  it('routes to /onboarding/terms when a role exists but terms are not accepted', async () => {
    mockExchange.mockResolvedValue({ error: null })
    mockAuthedUser()
    mockSingle.mockResolvedValue({
      data: { active_role: 'coach', terms_accepted_at: null, full_name: 'Test Coach', avatar_url: null },
      error: null,
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/onboarding/terms')
  })
})

describe('GET /auth/callback — profile read hardening (BUG-34)', () => {
  it('routes a transient profile read failure to /dashboard, not role selection', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockExchange.mockResolvedValue({ error: null })
    mockAuthedUser()
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/dashboard')
    // BUG-35: a transient read failure must not trigger any profile write —
    // the seed/gap-fill decision needs a trustworthy row to branch on.
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('still routes a genuine no-row result (PGRST116) to /onboarding/role', async () => {
    mockExchange.mockResolvedValue({ error: null })
    mockAuthedUser()
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/onboarding/role')
  })
})

// BUG-35: provider metadata must only ever FILL GAPS in user_profiles — a
// returning OAuth login must never overwrite a user-entered name or avatar,
// while a genuinely new user still gets the full metadata seed (Fix-11i).
describe('GET /auth/callback — fill-gaps-only profile writes (BUG-35)', () => {
  const googleMetadata = {
    full_name: 'Lasith Harshana',
    picture: 'https://lh3.googleusercontent.com/photo.jpg',
  }

  beforeEach(() => {
    mockExchange.mockResolvedValue({ error: null })
  })

  it('issues NO write when the existing profile already has a name and avatar', async () => {
    mockAuthedUser(googleMetadata)
    mockSingle.mockResolvedValue({
      data: {
        active_role: 'coach',
        terms_accepted_at: '2026-01-01T00:00:00Z',
        full_name: 'Alestair Cook',
        avatar_url: 'https://cdn.example/own-photo.png',
      },
      error: null,
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/coach/dashboard')
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('fills only the missing avatar when the name is user-entered', async () => {
    mockAuthedUser(googleMetadata)
    mockSingle.mockResolvedValue({
      data: {
        active_role: 'coach',
        terms_accepted_at: '2026-01-01T00:00:00Z',
        full_name: 'Alestair Cook',
        avatar_url: null,
      },
      error: null,
    })
    await callCallback('?code=abc')
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const payload = mockUpdate.mock.calls[0][0]
    expect(payload.avatar_url).toBe(googleMetadata.picture)
    expect(payload).not.toHaveProperty('full_name')
  })

  it('fills an empty-string name (and missing avatar) from metadata', async () => {
    mockAuthedUser(googleMetadata)
    mockSingle.mockResolvedValue({
      data: { active_role: null, terms_accepted_at: null, full_name: '', avatar_url: null },
      error: null,
    })
    await callCallback('?code=abc')
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const payload = mockUpdate.mock.calls[0][0]
    expect(payload.full_name).toBe('Lasith Harshana')
    expect(payload.avatar_url).toBe(googleMetadata.picture)
  })

  it('issues no write when fields are empty but metadata has nothing to offer', async () => {
    mockAuthedUser({})
    mockSingle.mockResolvedValue({
      data: { active_role: null, terms_accepted_at: null, full_name: '', avatar_url: null },
      error: null,
    })
    await callCallback('?code=abc')
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('seeds a brand-new user (no row) with the full metadata payload — Fix-11i preserved', async () => {
    mockAuthedUser(googleMetadata)
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/onboarding/role')
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        auth_user_id: 'user-123',
        full_name: 'Lasith Harshana',
        avatar_url: googleMetadata.picture,
        auth_provider: 'google',
      },
      // DO NOTHING — the seed itself must be unable to overwrite.
      { onConflict: 'auth_user_id', ignoreDuplicates: true }
    )
  })

  it('a failed seed still routes to /onboarding/role (BUG-26 recovery is the net)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockAuthedUser(googleMetadata)
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })
    mockUpsert.mockResolvedValue({ error: { code: '57014', message: 'timeout' } })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/onboarding/role')
    consoleSpy.mockRestore()
  })
})

// P-04-B (AUTH-FLOW-01): the ?role= param carried on the redirectTo URL.
// Allow-list validated before ANY use; a stored role always beats the URL.
describe('GET /auth/callback — ?role= param (P-04-B)', () => {
  beforeEach(() => {
    mockExchange.mockResolvedValue({ error: null })
    mockAuthedUser()
  })

  it('forwards a valid role to the role picker for a brand-new user', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })
    const target = await callCallback('?code=abc&role=parent')
    expect(target).toBe('/onboarding/role?role=parent')
  })

  it('forwards a valid role when a row exists but active_role is null', async () => {
    mockSingle.mockResolvedValue({
      data: { active_role: null, terms_accepted_at: null, full_name: 'X', avatar_url: null },
      error: null,
    })
    const target = await callCallback('?code=abc&role=player')
    expect(target).toBe('/onboarding/role?role=player')
  })

  it('silently drops an invalid role value (validated-null short-circuit)', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })
    const target = await callCallback('?code=abc&role=superadmin')
    expect(target).toBe('/onboarding/role')
  })

  it('ignores the param entirely when the user already has a role — stored role wins', async () => {
    mockSingle.mockResolvedValue({
      data: {
        active_role: 'coach',
        terms_accepted_at: '2026-01-01T00:00:00Z',
        full_name: 'Test Coach',
        avatar_url: 'https://cdn.example/photo.png',
      },
      error: null,
    })
    const target = await callCallback('?code=abc&role=parent')
    expect(target).toBe('/coach/dashboard')
  })
})

// P-04-B stale-branch fix: parent/player with role + terms complete used to
// bounce to /onboarding/role (pre-dashboard placeholder).
describe('GET /auth/callback — parent/player routing fix (P-04-B)', () => {
  it('routes an onboarded parent to /parent/dashboard', async () => {
    mockExchange.mockResolvedValue({ error: null })
    mockAuthedUser()
    mockSingle.mockResolvedValue({
      data: {
        active_role: 'parent',
        terms_accepted_at: '2026-01-01T00:00:00Z',
        full_name: 'Test Parent',
        avatar_url: null,
      },
      error: null,
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/parent/dashboard')
  })

  it('routes an onboarded player to /parent/dashboard', async () => {
    mockExchange.mockResolvedValue({ error: null })
    mockAuthedUser()
    mockSingle.mockResolvedValue({
      data: {
        active_role: 'player',
        terms_accepted_at: '2026-01-01T00:00:00Z',
        full_name: 'Test Player',
        avatar_url: null,
      },
      error: null,
    })
    const target = await callCallback('?code=abc')
    expect(target).toBe('/parent/dashboard')
  })
})
