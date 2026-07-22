// BUG-25: GET /api/payments/connect/login-link
// Generates a one-time Stripe Express dashboard login link and 303-redirects to
// it — but ONLY for a coach with a valid stripe_account_id AND
// stripe_onboarding_complete = true. Any other state redirects back to
// /coach/get-paid without minting a link.

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { GET } from '@/app/api/payments/connect/login-link/route'

const mockGetUser = jest.fn()
const mockCreateLoginLink = jest.fn()

// Per-table chain: user_profiles resolves via .single(), coach_profiles via
// .maybeSingle(). Each returns the data configured for the current test.
function buildSupabase(opts: {
  user: unknown
  userProfile: { data: unknown; error: unknown }
  coach: { data: unknown; error: unknown }
}) {
  mockGetUser.mockResolvedValue({ data: { user: opts.user }, error: null })
  const from = jest.fn((table: string) => {
    const chain: Record<string, jest.Mock> = {}
    for (const m of ['select', 'eq']) chain[m] = jest.fn(() => chain)
    chain.single = jest.fn().mockResolvedValue(opts.userProfile)
    chain.maybeSingle = jest.fn().mockResolvedValue(opts.coach)
    void table
    return chain
  })
  return { auth: { getUser: mockGetUser }, from }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getStripe as jest.Mock).mockReturnValue({
    accounts: { createLoginLink: mockCreateLoginLink },
  })
})

function callGet() {
  return GET()
}

describe('GET /api/payments/connect/login-link — BUG-25', () => {
  const user = { id: 'auth-1', email: 'coach@crikly.app' }

  it('303-redirects to the Stripe login link when onboarded with a stripe_account_id', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(
      buildSupabase({
        user,
        userProfile: { data: { id: 'up-1' }, error: null },
        coach: {
          data: { id: 'cp-1', stripe_account_id: 'acct_123', stripe_onboarding_complete: true },
          error: null,
        },
      }),
    )
    mockCreateLoginLink.mockResolvedValue({ url: 'https://connect.stripe.com/express/abc123' })

    const res = await callGet()

    // 303 = the login-link redirect path (vs 307 for the gate fallback). The
    // one-time URL is placed in the Location header by NextResponse.redirect;
    // the jest Headers polyfill can't surface it, so we assert the status and
    // that the link was minted for the right account instead.
    expect(res.status).toBe(303)
    expect(mockCreateLoginLink).toHaveBeenCalledWith('acct_123')
  })

  it('redirects back to /coach/get-paid (no link) when not onboarded', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(
      buildSupabase({
        user,
        userProfile: { data: { id: 'up-1' }, error: null },
        coach: {
          data: { id: 'cp-1', stripe_account_id: 'acct_123', stripe_onboarding_complete: false },
          error: null,
        },
      }),
    )

    const res = await callGet()

    // 307 = the gate fallback redirect (back to /coach/get-paid); no link minted.
    expect(res.status).toBe(307)
    expect(mockCreateLoginLink).not.toHaveBeenCalled()
  })

  it('redirects back to /coach/get-paid (no link) when there is no stripe_account_id', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(
      buildSupabase({
        user,
        userProfile: { data: { id: 'up-1' }, error: null },
        coach: {
          data: { id: 'cp-1', stripe_account_id: null, stripe_onboarding_complete: true },
          error: null,
        },
      }),
    )

    const res = await callGet()

    expect(res.status).toBe(307)
    expect(mockCreateLoginLink).not.toHaveBeenCalled()
  })
})
