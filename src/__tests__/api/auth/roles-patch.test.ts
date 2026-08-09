jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    getAll: () => [],
    set: jest.fn(),
  })),
}))

jest.mock('@/lib/resend/coach-lifecycle-emails', () => ({
  sendCoachWelcomeEmail: jest.fn(),
}))

import { createServerClient } from '@supabase/ssr'

// P-04-C: PATCH /api/auth/roles — the lightweight active_role-only switch.
// Must ONLY flip user_profiles.active_role for a role the account already
// holds: no user_roles writes, no coach_profiles creation, no emails, no
// user_metadata rewrites (those side-effects belong to POST).

const mockGetUser = jest.fn()
const mockProfileSingle = jest.fn()
const mockRoleMaybeSingle = jest.fn()
const mockUpdateEq = jest.fn()
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }))
const mockUpsert = jest.fn()
const mockUpdateUser = jest.fn()

const mockFrom = jest.fn((table: string) => {
  if (table === 'user_profiles') {
    return {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ single: mockProfileSingle })),
      })),
      update: mockUpdate,
      upsert: mockUpsert,
    }
  }
  // user_roles held-role lookup: select().eq().eq().maybeSingle()
  const chain: Record<string, jest.Mock> = {}
  chain.select = jest.fn(() => chain)
  chain.eq = jest.fn(() => chain)
  chain.maybeSingle = mockRoleMaybeSingle
  chain.upsert = mockUpsert
  return chain
})

const mockSupabase = {
  auth: { getUser: mockGetUser, updateUser: mockUpdateUser },
  from: mockFrom,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
  mockUpdateEq.mockResolvedValue({ error: null })
})

async function callPatch(body: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/auth/roles/route')
  const request = new Request('http://localhost/api/auth/roles', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return PATCH(request)
}

function authedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'auth-1', email: 'coach@example.com' } },
    error: null,
  })
  mockProfileSingle.mockResolvedValue({
    data: { id: 'profile-1' },
    error: null,
  })
}

describe('PATCH /api/auth/roles', () => {
  it('returns 400 for an invalid role', async () => {
    const res = await callPatch({ role: 'admin' })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'no session' },
    })
    const res = await callPatch({ role: 'parent' })
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 ROLE_NOT_HELD when switching to a role the account has not added', async () => {
    authedUser()
    mockRoleMaybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await callPatch({ role: 'parent' })
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error.code).toBe('ROLE_NOT_HELD')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('switches active_role for a held role and routes parent to the parent dashboard', async () => {
    authedUser()
    mockRoleMaybeSingle.mockResolvedValue({ data: { id: 'role-1' }, error: null })
    const res = await callPatch({ role: 'parent' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.redirectTo).toBe('/parent/dashboard')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ active_role: 'parent' }),
    )
  })

  it('routes a coach switch to the coach dashboard', async () => {
    authedUser()
    mockRoleMaybeSingle.mockResolvedValue({ data: { id: 'role-1' }, error: null })
    const res = await callPatch({ role: 'coach' })
    const data = await res.json()
    expect(data.redirectTo).toBe('/coach/dashboard')
  })

  it('performs NONE of the POST setup side-effects on switch', async () => {
    authedUser()
    mockRoleMaybeSingle.mockResolvedValue({ data: { id: 'role-1' }, error: null })
    await callPatch({ role: 'parent' })
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('returns 500 when the active_role update fails', async () => {
    authedUser()
    mockRoleMaybeSingle.mockResolvedValue({ data: { id: 'role-1' }, error: null })
    mockUpdateEq.mockResolvedValue({ error: { message: 'db down' } })
    const res = await callPatch({ role: 'parent' })
    expect(res.status).toBe(500)
  })
})
