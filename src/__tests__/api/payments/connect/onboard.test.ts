// BUG-45: GET /api/payments/connect/onboard — bank details in the status
// response. The route now surfaces the coach's real payout destination
// (bank_name + last4) from Stripe external_accounts so the Get Paid page
// never renders placeholder bank details. Only bank_name and last4 may
// leave the route — never full account numbers.

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { GET } from '@/app/api/payments/connect/onboard/route'

const mockGetUser = jest.fn()
const mockAccountsRetrieve = jest.fn()

function buildSupabase(opts: {
  user: unknown
  userProfile: { data: unknown; error: unknown }
  coach: { data: unknown; error: unknown }
}) {
  mockGetUser.mockResolvedValue({ data: { user: opts.user }, error: null })
  const from = jest.fn((table: string) => {
    if (table === 'user_profiles') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue(opts.userProfile),
          }),
        }),
      }
    }
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue(opts.coach),
        }),
      }),
    }
  })
  return { auth: { getUser: mockGetUser }, from }
}

function connectedCoachSupabase() {
  return buildSupabase({
    user: { id: 'auth-user-1' },
    userProfile: { data: { id: 'profile-1' }, error: null },
    coach: { data: { id: 'coach-1', stripe_account_id: 'acct_test_45' }, error: null },
  })
}

function makeAccount(externalAccounts: Array<Record<string, unknown>>) {
  return {
    id: 'acct_test_45',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    external_accounts: { object: 'list', data: externalAccounts },
  }
}

// The GET handler never reads the request — a plain Request cast matches the
// pattern used by the other API route tests (jest.setup.ts polyfills Request
// in a way that conflicts with constructing NextRequest directly).
function makeRequest(): Parameters<typeof GET>[0] {
  return new Request('http://localhost/api/payments/connect/onboard') as Parameters<typeof GET>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getStripe as jest.Mock).mockReturnValue({ accounts: { retrieve: mockAccountsRetrieve } })
})

describe('GET /api/payments/connect/onboard — bank details (BUG-45)', () => {
  it('returns bank_name and bank_last4 from the default-for-currency bank account', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(connectedCoachSupabase())
    mockAccountsRetrieve.mockResolvedValue(
      makeAccount([
        { object: 'bank_account', bank_name: 'Old Bank', last4: '1111', default_for_currency: false },
        { object: 'bank_account', bank_name: 'Monzo Bank', last4: '5678', default_for_currency: true },
      ]),
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data.connected).toBe(true)
    expect(data.bank_name).toBe('Monzo Bank')
    expect(data.bank_last4).toBe('5678')
  })

  it('falls back to the first bank account when none is default_for_currency', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(connectedCoachSupabase())
    mockAccountsRetrieve.mockResolvedValue(
      makeAccount([{ object: 'bank_account', bank_name: 'Starling', last4: '9012', default_for_currency: false }]),
    )

    const res = await GET(makeRequest())
    const data = await res.json() as Record<string, unknown>
    expect(data.bank_name).toBe('Starling')
    expect(data.bank_last4).toBe('9012')
  })

  it('ignores card external accounts — only bank accounts count', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(connectedCoachSupabase())
    mockAccountsRetrieve.mockResolvedValue(
      makeAccount([{ object: 'card', last4: '4242', brand: 'visa' }]),
    )

    const res = await GET(makeRequest())
    const data = await res.json() as Record<string, unknown>
    expect(data.bank_name).toBeNull()
    expect(data.bank_last4).toBeNull()
  })

  it('returns null bank fields when the account has no external accounts', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(connectedCoachSupabase())
    mockAccountsRetrieve.mockResolvedValue(makeAccount([]))

    const res = await GET(makeRequest())
    const data = await res.json() as Record<string, unknown>
    expect(data.connected).toBe(true)
    expect(data.bank_name).toBeNull()
    expect(data.bank_last4).toBeNull()
  })

  it('never includes full account numbers or sort codes in the response', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(connectedCoachSupabase())
    mockAccountsRetrieve.mockResolvedValue(
      makeAccount([
        {
          object: 'bank_account',
          bank_name: 'Monzo Bank',
          last4: '5678',
          default_for_currency: true,
          account_number: '00005678',
          routing_number: '108800',
        },
      ]),
    )

    const res = await GET(makeRequest())
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain('00005678')
    expect(body).not.toContain('108800')
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(
      ['bank_last4', 'bank_name', 'charges_enabled', 'connected', 'details_submitted', 'payouts_enabled'],
    )
  })

  it('still returns { connected: false } with no bank fields when no Stripe account is linked', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(
      buildSupabase({
        user: { id: 'auth-user-1' },
        userProfile: { data: { id: 'profile-1' }, error: null },
        coach: { data: { id: 'coach-1', stripe_account_id: null }, error: null },
      }),
    )

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data).toEqual({ connected: false })
    expect(mockAccountsRetrieve).not.toHaveBeenCalled()
  })
})
