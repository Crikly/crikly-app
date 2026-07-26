// C-PAY-05 — GET /api/coaches/earnings must expose the gross session price
// (bookings.coach_price_pence) on each payout item so the UI can derive the
// Stripe fee (gross − net); the fee itself is not stored anywhere.

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/auth/require-coach', () => ({
  requireCoachContext: jest.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAYOUT_ROWS = [
  {
    id: 'po-1',
    booking_id: 'bk-1',
    amount_pence: 3920, // 4000 gross − 80p actual Stripe fee (C-PAY-02)
    currency: 'GBP',
    status: 'paid',
    scheduled_at: '2026-07-20T10:00:00Z',
    processed_at: '2026-07-20T11:00:00Z',
  },
  {
    id: 'po-2',
    booking_id: 'bk-orphan', // no matching booking row → null booking fields
    amount_pence: 2500,
    currency: 'GBP',
    status: 'pending',
    scheduled_at: '2026-07-25T10:00:00Z',
    processed_at: null,
  },
]

const BOOKING_ROWS = [
  {
    id: 'bk-1',
    booking_reference: 'CRK-1001',
    session_date: '2026-07-18',
    session_type: 'individual',
    coach_price_pence: 4000,
  },
]

// ─── Supabase chain mocks ─────────────────────────────────────────────────────

const payoutsChain = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn(),
}

const bookingsChain = {
  select: jest.fn().mockReturnThis(),
  in: jest.fn(),
}

const mockFrom = jest.fn((table: string) =>
  table === 'payouts' ? payoutsChain : bookingsChain,
)

beforeEach(() => {
  jest.clearAllMocks()
  payoutsChain.select.mockReturnThis()
  payoutsChain.eq.mockReturnThis()
  payoutsChain.order.mockResolvedValue({ data: PAYOUT_ROWS, error: null })
  bookingsChain.select.mockReturnThis()
  bookingsChain.in.mockResolvedValue({ data: BOOKING_ROWS, error: null })
  ;(createClient as jest.Mock).mockResolvedValue({ from: mockFrom })
  ;(requireCoachContext as jest.Mock).mockResolvedValue({
    context: {
      user: { id: 'auth-user-1' },
      userProfile: { id: 'up-1' },
      coachProfile: { id: 'coach-1' },
    },
    error: null,
  })
})

async function callGet() {
  const { GET } = await import('@/app/api/coaches/earnings/route')
  return GET()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/coaches/earnings — C-PAY-05 payout item shape', () => {
  it('includes coach_price_pence on each payout item', async () => {
    const res = await callGet()
    expect(res.status).toBe(200)
    const body = await res.json()

    const item = body.payouts.find((p: { id: string }) => p.id === 'po-1')
    expect(item).toMatchObject({
      booking_id: 'bk-1',
      booking_reference: 'CRK-1001',
      session_date: '2026-07-18',
      session_type: 'individual',
      coach_price_pence: 4000,
      amount_pence: 3920,
    })
    // The fee the UI derives: gross − net, integer pence.
    expect(item.coach_price_pence - item.amount_pence).toBe(80)
  })

  it('selects coach_price_pence from the bookings table', async () => {
    await callGet()
    expect(bookingsChain.select).toHaveBeenCalledWith(
      expect.stringContaining('coach_price_pence'),
    )
  })

  it('returns coach_price_pence: null when the booking row is missing', async () => {
    const res = await callGet()
    const body = await res.json()

    const orphan = body.payouts.find((p: { id: string }) => p.id === 'po-2')
    expect(orphan.coach_price_pence).toBeNull()
    expect(orphan.booking_reference).toBeNull()
    expect(orphan.amount_pence).toBe(2500)
  })

  it('returns an empty payouts array untouched (Block 0 coaches)', async () => {
    payoutsChain.order.mockResolvedValue({ data: [], error: null })
    const res = await callGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.payouts).toEqual([])
    expect(body.summary.total_earned_pence).toBe(0)
  })
})
