// BUG-49: DELETE /api/coaches/account — the four-case deletion contract.
//
//   1. Upcoming bookings (confirmed/pending_approval, today onwards) → 409
//      UPCOMING_BOOKINGS — the coach can act on these (cancel/complete).
//   2. Owed payouts (pending/processing/held) → 409 PENDING_PAYOUTS.
//   3. Past-only booking history → step 8's auth.users hard delete FK-fails
//      (bookings.coach_profile_id is ON DELETE RESTRICT via the
//      auth.users → user_profiles → coach_profiles cascade) → 500
//      BOOKING_HISTORY. The old code swallowed this and returned
//      { success: true }: silent 200, client logged the coach out, account
//      still alive in auth.users.
//   4. No activity at all → full deletion succeeds, 200 { success: true }.

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/auth/require-coach', () => ({
  requireCoachContext: jest.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCoachContext } from '@/lib/auth/require-coach'
import { DELETE } from '@/app/api/coaches/account/route'

type MockFn = jest.Mock

const AUTH_USER_ID = 'auth-user-bug49'
const PROFILE_ID = 'profile-uuid-bug49'
const COACH_ID = 'coach-uuid-bug49'

function buildMocks(opts: {
  upcomingCount?: number
  upcomingError?: { message: string } | null
  owedPayoutCount?: number
  otherActiveRoleCount?: number
  stripeAccountId?: string | null
  authDeleteError?: { message: string } | null
}) {
  const bookingFilters: Array<{ statuses: unknown; fromDate: unknown }> = []

  const supabase = {
    from: jest.fn((table: string) => {
      if (table === 'coach_profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { stripe_account_id: opts.stripeAccountId ?? 'acct_x' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'bookings') {
        // Upcoming-only chain: select().eq().in(statuses).gte(session_date).
        // Captures the filters so tests can assert the guard stays scoped to
        // upcoming bookings and never regresses to an unfiltered count.
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn((_col: string, statuses: unknown) => ({
                gte: jest.fn((_dateCol: string, fromDate: unknown) => {
                  bookingFilters.push({ statuses, fromDate })
                  return Promise.resolve({
                    count: opts.upcomingCount ?? 0,
                    error: opts.upcomingError ?? null,
                  })
                }),
              })),
            }),
          }),
        }
      }
      if (table === 'payouts') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({
                count: opts.owedPayoutCount ?? 0,
                error: null,
              }),
            }),
          }),
        }
      }
      // user_roles: select().eq().neq().eq() → awaited
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            neq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                count: opts.otherActiveRoleCount ?? 0,
                error: null,
              }),
            }),
          }),
        }),
      }
    }),
  }

  const softDeletes: Array<Record<string, unknown>> = []
  const roleDeactivations: Array<Record<string, unknown>> = []
  const admin = {
    from: jest.fn((table: string) => {
      if (table === 'coach_profiles') {
        return {
          update: jest.fn((values: Record<string, unknown>) => {
            softDeletes.push(values)
            return { eq: jest.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      // user_roles deactivation: update().eq().eq()
      return {
        update: jest.fn((values: Record<string, unknown>) => {
          roleDeactivations.push(values)
          return {
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          }
        }),
      }
    }),
    auth: {
      admin: {
        deleteUser: jest.fn().mockResolvedValue({
          data: {},
          error: opts.authDeleteError ?? null,
        }),
      },
    },
  }

  ;(createClient as MockFn).mockResolvedValue(supabase)
  ;(createAdminClient as MockFn).mockReturnValue(admin)
  ;(requireCoachContext as MockFn).mockResolvedValue({
    context: {
      user: { id: AUTH_USER_ID },
      userProfile: { id: PROFILE_ID },
      coachProfile: { id: COACH_ID },
    },
    error: null,
  })

  return { supabase, admin, bookingFilters, softDeletes, roleDeactivations }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('DELETE /api/coaches/account — four-case deletion contract (BUG-49)', () => {
  // Case 1 — upcoming bookings
  it('blocks with 409 UPCOMING_BOOKINGS when upcoming sessions exist', async () => {
    const { admin, bookingFilters, softDeletes } = buildMocks({ upcomingCount: 2 })

    const res = await DELETE()
    expect(res.status).toBe(409)
    const data = (await res.json()) as { error: string; code?: string }
    expect(data.code).toBe('UPCOMING_BOOKINGS')
    expect(data.error).toBe('You have upcoming sessions. Please cancel them first.')

    // The guard is scoped to upcoming: actionable statuses, today onwards.
    expect(bookingFilters).toHaveLength(1)
    expect(bookingFilters[0].statuses).toEqual(['confirmed', 'pending_approval'])
    expect(typeof bookingFilters[0].fromDate).toBe('string')

    expect(softDeletes).toEqual([])
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  // Case 2 — owed payouts
  it('blocks with 409 PENDING_PAYOUTS when owed payouts exist', async () => {
    const { admin, softDeletes } = buildMocks({ upcomingCount: 0, owedPayoutCount: 1 })

    const res = await DELETE()
    expect(res.status).toBe(409)
    const data = (await res.json()) as { error: string; code?: string }
    expect(data.code).toBe('PENDING_PAYOUTS')
    expect(data.error).toBe('You have pending payouts. Please wait for them to clear.')
    expect(softDeletes).toEqual([])
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  // Case 3 — past-only booking history: deleteUser FK-fails → loud 500
  it('returns 500 BOOKING_HISTORY (not success) when the auth delete FK-fails on past bookings', async () => {
    const { admin } = buildMocks({
      upcomingCount: 0,
      authDeleteError: {
        message:
          'update or delete on table "coach_profiles" violates foreign key constraint "bookings_coach_profile_id_fkey"',
      },
    })

    const res = await DELETE()
    expect(res.status).toBe(500)
    const data = (await res.json()) as { error: string; code?: string; success?: boolean }
    expect(data.success).toBeUndefined()
    expect(data.code).toBe('BOOKING_HISTORY')
    expect(data.error).toBe(
      'Your account cannot be fully deleted because it has booking history. Please contact hello@crikly.app for assistance.',
    )
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(AUTH_USER_ID)
  })

  // Case 4 — no activity at all
  it('deletes successfully (200) when there is no activity: soft-delete, role deactivation, auth delete', async () => {
    const { admin, softDeletes, roleDeactivations } = buildMocks({
      upcomingCount: 0,
      owedPayoutCount: 0,
      otherActiveRoleCount: 0,
    })

    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { success?: boolean }).success).toBe(true)

    expect(softDeletes).toHaveLength(1)
    expect(typeof softDeletes[0].deleted_at).toBe('string')
    expect(roleDeactivations).toHaveLength(1)
    expect(roleDeactivations[0].is_active).toBe(false)
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(AUTH_USER_ID)
  })

  // Supporting behaviour
  it('skips the auth delete entirely for multi-role accounts (200, no deleteUser)', async () => {
    const { admin, softDeletes } = buildMocks({
      upcomingCount: 0,
      otherActiveRoleCount: 1,
    })

    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(softDeletes).toHaveLength(1)
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('returns 500 when the upcoming-bookings count read fails, before any write', async () => {
    const { admin, softDeletes } = buildMocks({
      upcomingError: { message: 'db down' },
    })

    const res = await DELETE()
    expect(res.status).toBe(500)
    expect(softDeletes).toEqual([])
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })
})
