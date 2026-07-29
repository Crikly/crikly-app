// Coach welcome email (PERMANENT): POST /api/auth/roles fires it —
// but ONLY on first-time coach registration (Lasith's clarification: never
// for parent/player, and re-selecting the coach role must not re-send).

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    getAll: () => [],
    set: () => undefined,
  }),
}))

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('@/lib/resend/coach-lifecycle-emails', () => ({
  sendCoachWelcomeEmail: jest.fn().mockResolvedValue(true),
}))

import { createServerClient } from '@supabase/ssr'
import { sendCoachWelcomeEmail } from '@/lib/resend/coach-lifecycle-emails'
import { POST } from '@/app/api/auth/roles/route'

type MockFn = jest.Mock

const PROFILE_ID = 'profile-uuid-roles'

function buildSupabase(opts: { existingCoachRole: boolean }) {
  const coachRoleChecks: string[] = []

  const userProfilesTable = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: PROFILE_ID },
          error: null,
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
  }

  const userRolesTable = {
    select: jest.fn((cols: string) => {
      coachRoleChecks.push(cols)
      return {
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: opts.existingCoachRole ? { id: 'existing-role-row' } : null,
              error: null,
            }),
          }),
        }),
      }
    }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
  }

  const coachProfilesTable = {
    upsert: jest.fn().mockResolvedValue({ error: null }),
  }

  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user: {
            id: 'auth-user-1',
            email: 'coach@example.com',
            user_metadata: { full_name: 'Sam Coach' },
            app_metadata: { provider: 'email' },
          },
        },
        error: null,
      }),
      updateUser: jest.fn().mockResolvedValue({ error: null }),
    },
    from: jest.fn((table: string) => {
      if (table === 'user_profiles') return userProfilesTable
      if (table === 'user_roles') return userRolesTable
      return coachProfilesTable
    }),
  }

  ;(createServerClient as MockFn).mockReturnValue(supabase)
  return { supabase, coachRoleChecks }
}

function makePost(role: string) {
  return new Request('http://localhost/api/auth/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(sendCoachWelcomeEmail as MockFn).mockResolvedValue(true)
})

describe('POST /api/auth/roles — coach welcome email (permanent)', () => {
  it('sends the welcome email on FIRST-TIME coach registration', async () => {
    buildSupabase({ existingCoachRole: false })

    const res = await POST(makePost('coach'))
    expect(res.status).toBe(200)

    expect(sendCoachWelcomeEmail).toHaveBeenCalledTimes(1)
    const call = (sendCoachWelcomeEmail as MockFn).mock.calls[0][0] as Record<string, string>
    expect(call.coachEmail).toBe('coach@example.com')
    expect(call.coachName).toBe('Sam Coach')
    expect(call.dashboardUrl).toContain('/coach/dashboard')
  })

  it('does NOT re-send when the user already holds the coach role', async () => {
    buildSupabase({ existingCoachRole: true })

    const res = await POST(makePost('coach'))
    expect(res.status).toBe(200)
    expect(sendCoachWelcomeEmail).not.toHaveBeenCalled()
  })

  it('does NOT send for parent role selection (and skips the coach-role check)', async () => {
    const { coachRoleChecks } = buildSupabase({ existingCoachRole: false })

    const res = await POST(makePost('parent'))
    expect(res.status).toBe(200)
    expect(sendCoachWelcomeEmail).not.toHaveBeenCalled()
    expect(coachRoleChecks).toEqual([])
  })

  it('does NOT send for player role selection', async () => {
    buildSupabase({ existingCoachRole: false })

    const res = await POST(makePost('player'))
    expect(res.status).toBe(200)
    expect(sendCoachWelcomeEmail).not.toHaveBeenCalled()
  })

  it('role selection still succeeds when the email send reports failure', async () => {
    buildSupabase({ existingCoachRole: false })
    ;(sendCoachWelcomeEmail as MockFn).mockResolvedValue(false)

    const res = await POST(makePost('coach'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.success).toBe(true)
  })
})
