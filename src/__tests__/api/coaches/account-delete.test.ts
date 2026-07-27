// BUG-49: DELETE /api/coaches/account — booking-history guard.
//
// bookings.coach_profile_id is ON DELETE RESTRICT, so a coach with ANY
// booking row (any status, any date) cannot be hard-deleted from auth.users:
// the auth.users → user_profiles → coach_profiles cascade hits the FK and the
// whole delete fails. Step 2 must therefore block on any booking at all —
// the old upcoming-only check (confirmed/pending_approval, future-dated) let
// history-holding coaches through to a silent step-8 failure: route returned
// 200, user was logged out, account still existed.

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
  bookingCount?: number
  bookingError?: { message: string } | null
  owedPayoutCount?: number
  otherActiveRoleCount?: number
  stripeAccountId?: string | null
  authDeleteError?: { message: string } | null
}) {
  const bookingsEq = jest.fn().mockResolvedValue({
    count: opts.bookingCount ?? 0,
    error: opts.bookingError ?? null,
  })

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
        // BUG-49: the chain is select().eq() and nothing else — if the route
        // regressed to .in(status)/.gte(date) filtering, this mock would throw
        // on the missing method.
        return { select: jest.fn().mockReturnValue({ eq: bookingsEq }) }
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

  return { supabase, admin, bookingsEq, softDeletes, roleDeactivations }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('DELETE /api/coaches/account — booking-history guard (BUG-49)', () => {
  it('blocks deletion with 409 BOOKING_HISTORY when ANY booking exists', async () => {
    const { admin, bookingsEq, softDeletes } = buildMocks({ bookingCount: 3 })

    const res = await DELETE()
    expect(res.status).toBe(409)
    const data = (await res.json()) as { error: string; code?: string }
    expect(data.code).toBe('BOOKING_HISTORY')
    expect(data.error).toContain('booking history')
    expect(data.error).toContain('hello@crikly.app')

    // The count query is unfiltered beyond the coach id — any status, any date.
    expect(bookingsEq).toHaveBeenCalledWith('coach_profile_id', COACH_ID)

    // Nothing destructive happened.
    expect(softDeletes).toEqual([])
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('blocks even a single historical booking (count = 1)', async () => {
    const { admin } = buildMocks({ bookingCount: 1 })

    const res = await DELETE()
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code?: string }).code).toBe('BOOKING_HISTORY')
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('deletes successfully for a coach with zero bookings (only-coach path)', async () => {
    const { admin, softDeletes, roleDeactivations } = buildMocks({
      bookingCount: 0,
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

  it('still blocks on owed payouts (409 PENDING_PAYOUTS) when bookings are zero', async () => {
    const { admin, softDeletes } = buildMocks({ bookingCount: 0, owedPayoutCount: 2 })

    const res = await DELETE()
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code?: string }).code).toBe('PENDING_PAYOUTS')
    expect(softDeletes).toEqual([])
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('does NOT delete auth.users when other active roles exist (multi-role account)', async () => {
    const { admin, softDeletes } = buildMocks({
      bookingCount: 0,
      otherActiveRoleCount: 1,
    })

    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(softDeletes).toHaveLength(1)
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('returns 200 when auth delete fails after soft-delete (documented fallback — logged, non-fatal)', async () => {
    const { admin, softDeletes } = buildMocks({
      bookingCount: 0,
      authDeleteError: { message: 'unexpected RESTRICT reference' },
    })

    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(softDeletes).toHaveLength(1)
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledTimes(1)
  })

  it('returns 500 when the booking count read fails', async () => {
    const { admin, softDeletes } = buildMocks({
      bookingError: { message: 'db down' },
    })

    const res = await DELETE()
    expect(res.status).toBe(500)
    expect(softDeletes).toEqual([])
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })
})
