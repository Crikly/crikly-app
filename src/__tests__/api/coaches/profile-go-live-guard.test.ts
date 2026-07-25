// C-PAY-03 Guard 1: POST /api/coaches/profile rejects is_profile_live=true
// unless Stripe onboarding is complete — a live profile is bookable, and a
// booking with no payout destination strands the coach's money.
//
// Covered:
//   - no coach row / no stripe_account_id → 409 STRIPE_ONBOARDING_INCOMPLETE,
//     nothing written, Stripe never called
//   - stripe_onboarding_complete=true → goes live without calling Stripe
//   - webhook race: flag=false but Stripe says charges+payouts enabled →
//     flag synced to true, go-live proceeds
//   - flag=false and Stripe says not enabled → 409
//   - Stripe re-check throws → 502 STRIPE_STATUS_CHECK_FAILED (fail closed)
//   - is_profile_live=false is never blocked and skips the gate read entirely
//   - gate read DB error → 500

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/auth/require-coach', () => ({
  requireCoachRole: jest.fn(),
  requireCoachContext: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { requireCoachRole } from '@/lib/auth/require-coach'
import { getStripe } from '@/lib/stripe/client'
import { POST } from '@/app/api/coaches/profile/route'

type MockFn = jest.Mock

const COACH_ID = 'coach-uuid-cpay03'
const PROFILE_ID = 'profile-uuid-cpay03'

const GATE_COLS = 'stripe_onboarding_complete, stripe_account_id'

function makeUpdatedProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: COACH_ID,
    user_profile_id: PROFILE_ID,
    display_name: 'Coach Smithy',
    bio: null,
    years_experience: null,
    dbs_status: 'none',
    is_profile_live: true,
    is_paused: false,
    stripe_onboarding_complete: true,
    cancellation_window_hours: 24,
    min_advance_hours: 12,
    max_advance_days: 90,
    requires_manual_approval: false,
    travel_radius_miles: null,
    rating_avg: null,
    rating_count: 0,
    sessions_completed: 0,
    gender: null,
    languages: [],
    slug: 'coach-smithy',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    user_profiles: {
      full_name: 'Jonathan Realname',
      avatar_url: null,
      location_city: null,
      location_postcode: null,
    },
    ...overrides,
  }
}

interface GateRow {
  stripe_onboarding_complete: boolean
  stripe_account_id: string | null
}

// Tables touched when body = { is_profile_live: true }:
//   coach_profiles.select(GATE_COLS).eq().maybeSingle()   (Guard 1 gate read)
//   coach_profiles.update({stripe_onboarding_complete}).eq()  (race sync only)
//   coach_profiles.upsert()                                (on pass)
//   coach_profiles.select(<full list>).eq().single()       (read-back)
function buildSupabase(opts: {
  gateRow: GateRow | null
  gateError?: { message: string } | null
  updatedProfile?: Record<string, unknown>
}) {
  const gateReads: string[] = []
  const flagUpdates: Array<Record<string, unknown>> = []
  const upserts: Array<Record<string, unknown>> = []

  const coachProfilesTable = {
    upsert: jest.fn((values: Record<string, unknown>) => {
      upserts.push(values)
      return Promise.resolve({ error: null })
    }),
    select: jest.fn((cols: string) => {
      if (cols === GATE_COLS) {
        gateReads.push(cols)
        return {
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: opts.gateRow,
              error: opts.gateError ?? null,
            }),
          }),
        }
      }
      if (cols === 'id') {
        // findUniqueSlug probe — not exercised by these bodies, but keep safe
        interface ProbeChain {
          eq: MockFn
          neq: MockFn
          maybeSingle: MockFn
        }
        const chain: ProbeChain = {
          eq: jest.fn((): ProbeChain => chain),
          neq: jest.fn((): ProbeChain => chain),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }
        return chain
      }
      return {
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: opts.updatedProfile ?? makeUpdatedProfile(),
            error: null,
          }),
        }),
      }
    }),
    update: jest.fn((values: Record<string, unknown>) => {
      flagUpdates.push(values)
      return { eq: jest.fn().mockResolvedValue({ error: null }) }
    }),
  }

  const userProfilesTable = {
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  }

  const supabase = {
    from: jest.fn((table: string) =>
      table === 'coach_profiles' ? coachProfilesTable : userProfilesTable,
    ),
  }

  return { supabase, gateReads, flagUpdates, upserts }
}

function setup(opts: Parameters<typeof buildSupabase>[0]) {
  const built = buildSupabase(opts)
  ;(createClient as MockFn).mockResolvedValue(built.supabase)
  ;(requireCoachRole as MockFn).mockResolvedValue({
    context: { userProfile: { id: PROFILE_ID } },
    error: null,
  })
  return built
}

function mockStripeRetrieve(impl: () => Promise<unknown>) {
  const retrieve = jest.fn().mockImplementation(impl)
  ;(getStripe as MockFn).mockReturnValue({ accounts: { retrieve } })
  return retrieve
}

function makePost(body: Record<string, unknown>) {
  return new Request('http://localhost/api/coaches/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  // Default: Stripe must not be reached unless a test opts in.
  ;(getStripe as MockFn).mockImplementation(() => {
    throw new Error('getStripe called unexpectedly')
  })
})

describe('POST /api/coaches/profile — go-live guard (C-PAY-03)', () => {
  it('rejects go-live with no Stripe account at all', async () => {
    const { upserts } = setup({
      gateRow: { stripe_onboarding_complete: false, stripe_account_id: null },
    })

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(409)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.code).toBe('STRIPE_ONBOARDING_INCOMPLETE')
    expect(upserts).toEqual([])
  })

  it('rejects go-live when no coach profile row exists yet', async () => {
    const { upserts } = setup({ gateRow: null })

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(409)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.code).toBe('STRIPE_ONBOARDING_INCOMPLETE')
    expect(upserts).toEqual([])
  })

  it('allows go-live when stripe_onboarding_complete is already true, without calling Stripe', async () => {
    const { upserts, flagUpdates } = setup({
      gateRow: { stripe_onboarding_complete: true, stripe_account_id: 'acct_ready' },
    })

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(200)
    expect(upserts).toHaveLength(1)
    expect(upserts[0].is_profile_live).toBe(true)
    expect(flagUpdates).toEqual([]) // no sync needed
  })

  it('absorbs the webhook race: flag false but Stripe says enabled → sync + go live', async () => {
    const { upserts, flagUpdates } = setup({
      gateRow: { stripe_onboarding_complete: false, stripe_account_id: 'acct_racing' },
    })
    const retrieve = mockStripeRetrieve(async () => ({
      charges_enabled: true,
      payouts_enabled: true,
    }))

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(200)
    expect(retrieve).toHaveBeenCalledWith('acct_racing')
    expect(flagUpdates).toHaveLength(1)
    expect(flagUpdates[0].stripe_onboarding_complete).toBe(true)
    expect(upserts).toHaveLength(1)
    expect(upserts[0].is_profile_live).toBe(true)
  })

  it('rejects when the account exists but Stripe has not enabled charges/payouts', async () => {
    const { upserts } = setup({
      gateRow: { stripe_onboarding_complete: false, stripe_account_id: 'acct_pending' },
    })
    mockStripeRetrieve(async () => ({
      charges_enabled: false,
      payouts_enabled: false,
    }))

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(409)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.code).toBe('STRIPE_ONBOARDING_INCOMPLETE')
    expect(upserts).toEqual([])
  })

  it('fails closed with 502 when the Stripe re-check throws', async () => {
    const { upserts } = setup({
      gateRow: { stripe_onboarding_complete: false, stripe_account_id: 'acct_down' },
    })
    mockStripeRetrieve(async () => {
      throw new Error('stripe unreachable')
    })

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(502)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.code).toBe('STRIPE_STATUS_CHECK_FAILED')
    expect(upserts).toEqual([])
  })

  it('never blocks setting is_profile_live=false and skips the gate read', async () => {
    const { upserts, gateReads } = setup({
      gateRow: { stripe_onboarding_complete: false, stripe_account_id: null },
      updatedProfile: makeUpdatedProfile({
        is_profile_live: false,
        stripe_onboarding_complete: false,
      }),
    })

    const res = await POST(makePost({ is_profile_live: false }))
    expect(res.status).toBe(200)
    expect(gateReads).toEqual([])
    expect(upserts).toHaveLength(1)
    expect(upserts[0].is_profile_live).toBe(false)
  })

  it('returns 500 when the gate read itself fails', async () => {
    const { upserts } = setup({
      gateRow: null,
      gateError: { message: 'db down' },
    })

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(500)
    expect(upserts).toEqual([])
  })
})
