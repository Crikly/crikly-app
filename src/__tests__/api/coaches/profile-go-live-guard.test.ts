// C-PAY-03 Guard 1 + PILOT: POST /api/coaches/profile with
// is_profile_live=true no longer flips the flag — it SUBMITS the profile for
// manual review (submitted_for_review_at) once the Stripe guard passes, then
// emails the coach (Email A) and the review inbox (Email B, with a
// ?secret=-protected approve link). Liveness is granted only by the admin
// approve route.
//
// Covered:
//   - no coach row / no stripe_account_id → 409 STRIPE_ONBOARDING_INCOMPLETE,
//     nothing written, Stripe never called
//   - stripe_onboarding_complete=true → SUBMITS for review (writes
//     submitted_for_review_at, never is_profile_live) + Emails A and B
//   - already live → idempotent no-op: no submission write, no emails
//   - already pending → no re-submission, no emails (approve links don't
//     expire, so age is irrelevant)
//   - webhook race: flag=false but Stripe says charges+payouts enabled →
//     flag synced to true, submission proceeds
//   - flag=false and Stripe says not enabled → 409
//   - Stripe re-check throws → 502 STRIPE_STATUS_CHECK_FAILED (fail closed)
//   - is_profile_live=false is never blocked and skips the gate read entirely
//   - gate read DB error → 500
//   - auth user without an email → Email A skipped, Email B still sent

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

jest.mock('@/lib/resend/coach-lifecycle-emails', () => ({
  sendCoachReviewNotification: jest.fn().mockResolvedValue(true),
  sendCoachUnderReviewEmail: jest.fn().mockResolvedValue(true),
}))

import { createClient } from '@/lib/supabase/server'
import { requireCoachRole } from '@/lib/auth/require-coach'
import { getStripe } from '@/lib/stripe/client'
import {
  sendCoachReviewNotification,
  sendCoachUnderReviewEmail,
} from '@/lib/resend/coach-lifecycle-emails'
import { POST } from '@/app/api/coaches/profile/route'

type MockFn = jest.Mock

const COACH_ID = 'coach-uuid-cpay03'
const PROFILE_ID = 'profile-uuid-cpay03'
const SUBMITTED_AT = '2026-07-27T10:00:00.000+00:00'
const SECRET = 'test-approve-secret'
const COACH_EMAIL = 'coach@example.com'

const GATE_COLS =
  'stripe_onboarding_complete, stripe_account_id, is_profile_live, submitted_for_review_at'

function makeUpdatedProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: COACH_ID,
    user_profile_id: PROFILE_ID,
    display_name: 'Coach Smithy',
    bio: null,
    years_experience: null,
    dbs_status: 'none',
    is_profile_live: false,
    submitted_for_review_at: SUBMITTED_AT,
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
      location_city: 'Leeds',
      location_postcode: null,
    },
    ...overrides,
  }
}

interface GateRow {
  stripe_onboarding_complete: boolean
  stripe_account_id: string | null
  is_profile_live?: boolean
  submitted_for_review_at?: string | null
}

// Tables touched when body = { is_profile_live: true }:
//   coach_profiles.select(GATE_COLS).eq().maybeSingle()   (Guard 1 gate read)
//   coach_profiles.update({stripe_onboarding_complete}).eq()  (race sync only)
//   coach_profiles.upsert()                                (on pass)
//   coach_profiles.select(<full list>).eq().single()       (read-back)
//   coach_sports.select('sports ( name )').eq().eq()       (Email B payload)
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

  const coachSportsTable = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ sports: { name: 'Cricket' } }],
          error: null,
        }),
      }),
    }),
  }

  const userProfilesTable = {
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  }

  const supabase = {
    from: jest.fn((table: string) => {
      if (table === 'coach_profiles') return coachProfilesTable
      if (table === 'coach_sports') return coachSportsTable
      return userProfilesTable
    }),
  }

  return { supabase, gateReads, flagUpdates, upserts }
}

function setup(
  opts: Parameters<typeof buildSupabase>[0],
  authOpts: { userEmail?: string | null } = {},
) {
  const built = buildSupabase(opts)
  ;(createClient as MockFn).mockResolvedValue(built.supabase)
  ;(requireCoachRole as MockFn).mockResolvedValue({
    context: {
      user: { email: authOpts.userEmail === null ? undefined : (authOpts.userEmail ?? COACH_EMAIL) },
      userProfile: { id: PROFILE_ID },
    },
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
  // The route embeds this directly in the Email B approve URL.
  process.env.ADMIN_APPROVE_SECRET = SECRET
  ;(sendCoachReviewNotification as MockFn).mockResolvedValue(true)
  ;(sendCoachUnderReviewEmail as MockFn).mockResolvedValue(true)
  // Default: Stripe must not be reached unless a test opts in.
  ;(getStripe as MockFn).mockImplementation(() => {
    throw new Error('getStripe called unexpectedly')
  })
})

describe('POST /api/coaches/profile — go-live guard + submit-for-review (C-PAY-03 / PILOT)', () => {
  it('rejects submission with no Stripe account at all', async () => {
    const { upserts } = setup({
      gateRow: { stripe_onboarding_complete: false, stripe_account_id: null },
    })

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(409)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.code).toBe('STRIPE_ONBOARDING_INCOMPLETE')
    expect(upserts).toEqual([])
    expect(sendCoachReviewNotification).not.toHaveBeenCalled()
    expect(sendCoachUnderReviewEmail).not.toHaveBeenCalled()
  })

  it('rejects submission when no coach profile row exists yet', async () => {
    const { upserts } = setup({ gateRow: null })

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(409)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.code).toBe('STRIPE_ONBOARDING_INCOMPLETE')
    expect(upserts).toEqual([])
  })

  it('submits for review (never writes is_profile_live) and sends Emails A + B', async () => {
    const { upserts, flagUpdates } = setup({
      gateRow: {
        stripe_onboarding_complete: true,
        stripe_account_id: 'acct_ready',
        is_profile_live: false,
        submitted_for_review_at: null,
      },
    })

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(200)
    expect(upserts).toHaveLength(1)
    // PILOT heart of the change: the flag is never client-settable.
    expect(upserts[0].is_profile_live).toBeUndefined()
    expect(typeof upserts[0].submitted_for_review_at).toBe('string')
    expect(flagUpdates).toEqual([]) // no sync needed

    const body = (await res.json()) as Record<string, unknown>
    expect(body.is_profile_live).toBe(false)
    expect(body.submitted_for_review_at).toBe(SUBMITTED_AT)

    // Email A — under review, to the coach.
    expect(sendCoachUnderReviewEmail).toHaveBeenCalledTimes(1)
    const emailA = (sendCoachUnderReviewEmail as MockFn).mock.calls[0][0] as {
      coachEmail: string
      coachName: string
      profileUrl: string
    }
    expect(emailA.coachEmail).toBe(COACH_EMAIL)
    expect(emailA.coachName).toBe('Coach Smithy')
    // BUG-54: CTA must go to the dashboard — the public profile 404s pre-approval.
    expect(emailA.profileUrl).toContain('/coach/dashboard')
    expect(emailA.profileUrl).not.toContain('/coaches/')

    // Email B — review notification, with the secret-protected approve link.
    expect(sendCoachReviewNotification).toHaveBeenCalledTimes(1)
    const emailB = (sendCoachReviewNotification as MockFn).mock.calls[0][0] as {
      coachName: string
      sports: string[]
      location: string | null
      approveUrl: string
    }
    expect(emailB.coachName).toBe('Coach Smithy')
    expect(emailB.sports).toEqual(['Cricket'])
    expect(emailB.location).toBe('Leeds')
    expect(emailB.approveUrl).toContain(
      `/api/admin/coaches/${COACH_ID}/approve?secret=${SECRET}`,
    )
  })

  it('skips Email A but still sends Email B when the auth user has no email', async () => {
    setup(
      {
        gateRow: {
          stripe_onboarding_complete: true,
          stripe_account_id: 'acct_ready',
          is_profile_live: false,
          submitted_for_review_at: null,
        },
      },
      { userEmail: null },
    )

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(200)
    expect(sendCoachUnderReviewEmail).not.toHaveBeenCalled()
    expect(sendCoachReviewNotification).toHaveBeenCalledTimes(1)
  })

  it('skips Email B (but persists the submission) when ADMIN_APPROVE_SECRET is unset', async () => {
    const { upserts } = setup({
      gateRow: {
        stripe_onboarding_complete: true,
        stripe_account_id: 'acct_ready',
        is_profile_live: false,
        submitted_for_review_at: null,
      },
    })
    delete process.env.ADMIN_APPROVE_SECRET

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(200)
    expect(upserts).toHaveLength(1)
    expect(typeof upserts[0].submitted_for_review_at).toBe('string')
    expect(sendCoachUnderReviewEmail).toHaveBeenCalledTimes(1)
    expect(sendCoachReviewNotification).not.toHaveBeenCalled()
  })

  it('is idempotent for an already-live coach: no submission write, no emails', async () => {
    const { upserts } = setup({
      gateRow: {
        stripe_onboarding_complete: true,
        stripe_account_id: 'acct_ready',
        is_profile_live: true,
        submitted_for_review_at: SUBMITTED_AT,
      },
      updatedProfile: makeUpdatedProfile({ is_profile_live: true }),
    })

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(200)
    expect(upserts).toHaveLength(1)
    expect(upserts[0].is_profile_live).toBeUndefined()
    expect(upserts[0].submitted_for_review_at).toBeUndefined()
    expect(sendCoachReviewNotification).not.toHaveBeenCalled()
    expect(sendCoachUnderReviewEmail).not.toHaveBeenCalled()
  })

  it('does not re-submit or re-email while a submission is pending (recent)', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const { upserts } = setup({
      gateRow: {
        stripe_onboarding_complete: true,
        stripe_account_id: 'acct_ready',
        is_profile_live: false,
        submitted_for_review_at: twoDaysAgo,
      },
      updatedProfile: makeUpdatedProfile({ submitted_for_review_at: twoDaysAgo }),
    })

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(200)
    expect(upserts).toHaveLength(1)
    expect(upserts[0].submitted_for_review_at).toBeUndefined()
    expect(sendCoachReviewNotification).not.toHaveBeenCalled()
    expect(sendCoachUnderReviewEmail).not.toHaveBeenCalled()
  })

  it('does not re-submit even for an old pending submission (links never expire)', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const { upserts } = setup({
      gateRow: {
        stripe_onboarding_complete: true,
        stripe_account_id: 'acct_ready',
        is_profile_live: false,
        submitted_for_review_at: eightDaysAgo,
      },
      updatedProfile: makeUpdatedProfile({ submitted_for_review_at: eightDaysAgo }),
    })

    const res = await POST(makePost({ is_profile_live: true }))
    expect(res.status).toBe(200)
    expect(upserts).toHaveLength(1)
    expect(upserts[0].submitted_for_review_at).toBeUndefined()
    expect(sendCoachReviewNotification).not.toHaveBeenCalled()
    expect(sendCoachUnderReviewEmail).not.toHaveBeenCalled()
  })

  it('absorbs the webhook race: flag false but Stripe says enabled → sync + submit', async () => {
    const { upserts, flagUpdates } = setup({
      gateRow: {
        stripe_onboarding_complete: false,
        stripe_account_id: 'acct_racing',
        is_profile_live: false,
        submitted_for_review_at: null,
      },
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
    expect(upserts[0].is_profile_live).toBeUndefined()
    expect(typeof upserts[0].submitted_for_review_at).toBe('string')
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
        submitted_for_review_at: null,
        stripe_onboarding_complete: false,
      }),
    })

    const res = await POST(makePost({ is_profile_live: false }))
    expect(res.status).toBe(200)
    expect(gateReads).toEqual([])
    expect(upserts).toHaveLength(1)
    expect(upserts[0].is_profile_live).toBe(false)
    expect(sendCoachReviewNotification).not.toHaveBeenCalled()
    expect(sendCoachUnderReviewEmail).not.toHaveBeenCalled()
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
