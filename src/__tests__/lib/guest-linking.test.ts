// P-04-B: guest→account matching. Stripe search results are only trusted
// after cross-checking against our payment_intents audit table, and only
// records still owned by LIVE provisional profiles qualify.

const mockSearch = jest.fn()
jest.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({ paymentIntents: { search: mockSearch } }),
}))

// Chainable admin-client mock: each from(table) call resolves to the
// queued result for that table, in call order.
const tableResults: Record<string, Array<{ data: unknown; error: null }>> = {}
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const result = tableResults[table]?.shift() ?? { data: [], error: null }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'is', 'eq']) {
        chain[m] = jest.fn(() => chain)
      }
      ;(chain as { then: unknown }).then = (
        resolve: (v: { data: unknown; error: null }) => void,
      ) => resolve(result)
      return chain
    },
  }),
}))

import { findGuestBookings } from '@/lib/auth/guest-linking'

function queue(table: string, data: unknown) {
  tableResults[table] = tableResults[table] ?? []
  tableResults[table].push({ data, error: null })
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(tableResults)) delete tableResults[key]
})

describe('findGuestBookings', () => {
  it('returns empty for an empty or quote-stripped-to-empty email', async () => {
    expect(await findGuestBookings('')).toEqual({ matches: [], provisionalProfileIds: [] })
    expect(await findGuestBookings("'\"\\")).toEqual({ matches: [], provisionalProfileIds: [] })
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('strips quote characters from the email before building the search query', async () => {
    mockSearch.mockResolvedValue({ data: [] })
    await findGuestBookings("evil'and status:'canceled@example.com")
    const query = mockSearch.mock.calls[0][0].query as string
    expect(query).not.toContain("''")
    expect(query).toContain("metadata['guest_email']:'evilandstatus:canceled@example.com'")
  })

  it('returns empty when Stripe finds no succeeded intents', async () => {
    mockSearch.mockResolvedValue({ data: [] })
    const scan = await findGuestBookings('guest@example.com')
    expect(scan.matches).toEqual([])
  })

  it('ignores Stripe hits with no matching payment_intents audit row', async () => {
    mockSearch.mockResolvedValue({ data: [{ id: 'pi_unknown' }] })
    queue('payment_intents', []) // cross-check: nothing recorded by us
    const scan = await findGuestBookings('guest@example.com')
    expect(scan.matches).toEqual([])
  })

  it('matches bookings owned by live provisional profiles and excludes real-account owners', async () => {
    mockSearch.mockResolvedValue({ data: [{ id: 'pi_1' }, { id: 'pi_2' }] })
    queue('payment_intents', [
      { stripe_payment_intent_id: 'pi_1', booking_id: 'b1', enrolment_id: null },
      { stripe_payment_intent_id: 'pi_2', booking_id: 'b2', enrolment_id: null },
    ])
    queue('bookings', [
      {
        id: 'b1',
        booked_by_user_id: 'prov-1',
        session_date: '2026-07-20',
        venue_name: 'Kingston CC',
        parent_total_pence: 3300,
        coach_profiles: { display_name: 'Coach Dave' },
      },
      {
        id: 'b2',
        booked_by_user_id: 'real-1', // already a real account — excluded
        session_date: '2026-07-22',
        venue_name: 'Epsom',
        parent_total_pence: 4400,
        coach_profiles: { display_name: 'Coach Amy' },
      },
    ])
    queue('user_profiles', [{ id: 'prov-1' }]) // only prov-1 is live provisional

    const scan = await findGuestBookings('guest@example.com')
    expect(scan.matches).toHaveLength(1)
    expect(scan.matches[0]).toMatchObject({
      id: 'b1',
      kind: 'booking',
      coachName: 'Coach Dave',
      amountPaidPence: 3300,
    })
    expect(scan.provisionalProfileIds).toEqual(['prov-1'])
  })

  it('includes programme enrolments owned by provisional profiles', async () => {
    mockSearch.mockResolvedValue({ data: [{ id: 'pi_3' }] })
    queue('payment_intents', [
      { stripe_payment_intent_id: 'pi_3', booking_id: null, enrolment_id: 'e1' },
    ])
    queue('group_programme_enrolments', [
      {
        id: 'e1',
        booked_by_user_id: 'prov-2',
        parent_total_pence: null,
        block_amount_pence: 28000,
        group_programmes: {
          title: 'Summer Camp',
          venue_name: 'Epsom College',
          starts_at: '2026-08-10T09:00:00Z',
          coach_profiles: { display_name: 'Coach Amy' },
        },
      },
    ])
    queue('user_profiles', [{ id: 'prov-2' }])

    const scan = await findGuestBookings('guest@example.com')
    expect(scan.matches).toHaveLength(1)
    expect(scan.matches[0]).toMatchObject({
      id: 'e1',
      kind: 'enrolment',
      coachName: 'Coach Amy',
      sessionDate: '2026-08-10',
      amountPaidPence: 28000,
    })
  })
})
