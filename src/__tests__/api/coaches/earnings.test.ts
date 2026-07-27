// C-PAY-05 — GET /api/coaches/earnings must expose the gross session price
// (bookings.coach_price_pence) on each payout item so the UI can derive the
// Stripe fee (gross − net); the fee itself is not stored anywhere.
//
// C-PAY-06 — the endpoint additionally returns a unified `transactions` array
// (in-clearance bookings + payout rows in every state, newest session first)
// with participant names, plus summary.in_clearance_pence. Existing response
// fields are unchanged (additive contract).

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
    held_reason: null,
    failure_reason: null,
  },
  {
    id: 'po-2',
    booking_id: 'bk-orphan', // no matching booking row → null booking fields
    amount_pence: 2500,
    currency: 'GBP',
    status: 'pending',
    scheduled_at: '2026-07-25T10:00:00Z',
    processed_at: null,
    held_reason: null,
    failure_reason: null,
  },
  {
    id: 'po-3',
    booking_id: 'bk-3',
    amount_pence: 2941,
    currency: 'GBP',
    status: 'held',
    scheduled_at: '2026-07-22T10:00:00Z',
    processed_at: null,
    held_reason: 'no_stripe_account',
    failure_reason: null,
  },
  {
    id: 'po-4',
    booking_id: 'bk-4',
    amount_pence: 5881,
    currency: 'GBP',
    status: 'failed',
    scheduled_at: '2026-07-21T10:00:00Z',
    processed_at: null,
    held_reason: null,
    failure_reason: 'transfer declined',
  },
  {
    id: 'po-5',
    booking_id: 'bk-5',
    amount_pence: 4411,
    currency: 'GBP',
    status: 'processing',
    scheduled_at: '2026-07-23T10:00:00Z',
    processed_at: '2026-07-23T11:00:00Z',
    held_reason: null,
    failure_reason: null,
  },
]

const BOOKING_ROWS = [
  {
    id: 'bk-1',
    booking_reference: 'CRK-1001',
    session_date: '2026-07-18',
    session_type: 'individual',
    coach_price_pence: 4000,
    payout_eligible_at: '2026-07-20T10:00:00Z',
    participant_name: null,
    child_profiles: { full_name: 'Aarav Shah' },
    player_profiles: null,
  },
  {
    id: 'bk-3',
    booking_reference: 'CRK-1003',
    session_date: '2026-07-20',
    session_type: 'individual',
    coach_price_pence: 3000,
    payout_eligible_at: '2026-07-22T10:00:00Z',
    participant_name: 'Guest Kid', // migration-035 snapshot (guest booking)
    child_profiles: null,
    player_profiles: null,
  },
  {
    id: 'bk-4',
    booking_reference: 'CRK-1004',
    session_date: '2026-07-19',
    session_type: 'individual',
    coach_price_pence: 6000,
    payout_eligible_at: '2026-07-21T10:00:00Z',
    participant_name: null,
    child_profiles: null,
    player_profiles: { user_profiles: { full_name: 'Maya Perera' } },
  },
  {
    id: 'bk-5',
    booking_reference: 'CRK-1005',
    session_date: '2026-07-21',
    session_type: 'group',
    coach_price_pence: 4500,
    payout_eligible_at: '2026-07-23T10:00:00Z',
    participant_name: null,
    child_profiles: null,
    player_profiles: null, // RLS-blocked player join → 'Player' fallback
  },
]

// Completed booking still inside the 48h window — no payout row yet.
const CLEARANCE_ROWS = [
  {
    id: 'bk-c1',
    booking_reference: 'CRK-2001',
    session_date: '2026-07-26',
    coach_price_pence: 6000,
    currency: 'GBP',
    payout_eligible_at: '2026-07-28T10:00:00Z',
    participant_name: null,
    child_profiles: { full_name: 'Yuwin' },
    player_profiles: null,
    payouts: null,
  },
]

// ─── Supabase chain mocks ─────────────────────────────────────────────────────
//
// The route issues three queries:
//   payouts        → .select().eq().order()            (order resolves)
//   bookings (A)   → anti-join clearance query          (limit resolves)
//   bookings (B)   → history batch fetch                (in resolves)
// from('bookings') call #1 is the clearance query (fired inside Promise.all,
// before the history slice exists), call #2 is the batch fetch.

const payoutsChain = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn(),
}

const clearanceChain = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  gt: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn(),
}

const historyChain = {
  select: jest.fn().mockReturnThis(),
  in: jest.fn(),
}

let bookingsCallCount = 0

const mockFrom = jest.fn((table: string) => {
  if (table === 'payouts') return payoutsChain
  bookingsCallCount += 1
  return bookingsCallCount === 1 ? clearanceChain : historyChain
})

beforeEach(() => {
  jest.clearAllMocks()
  bookingsCallCount = 0
  payoutsChain.select.mockReturnThis()
  payoutsChain.eq.mockReturnThis()
  payoutsChain.order.mockResolvedValue({ data: PAYOUT_ROWS, error: null })
  clearanceChain.select.mockReturnThis()
  clearanceChain.eq.mockReturnThis()
  clearanceChain.is.mockReturnThis()
  clearanceChain.gt.mockReturnThis()
  clearanceChain.in.mockReturnThis()
  clearanceChain.order.mockReturnThis()
  clearanceChain.limit.mockResolvedValue({ data: CLEARANCE_ROWS, error: null })
  historyChain.select.mockReturnThis()
  historyChain.in.mockResolvedValue({ data: BOOKING_ROWS, error: null })
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

interface TxLike {
  id: string
  status: string
  session_date: string | null
  participant_name: string
  fee_pence: number | null
  net_pence: number
  held_reason: string | null
  failure_reason: string | null
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
    expect(historyChain.select).toHaveBeenCalledWith(
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

  it('returns empty arrays untouched (Block 0 coaches)', async () => {
    payoutsChain.order.mockResolvedValue({ data: [], error: null })
    clearanceChain.limit.mockResolvedValue({ data: [], error: null })
    const res = await callGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.payouts).toEqual([])
    expect(body.transactions).toEqual([])
    expect(body.summary.total_earned_pence).toBe(0)
    expect(body.summary.in_clearance_pence).toBe(0)
  })
})

describe('GET /api/coaches/earnings — C-PAY-06 unified transactions', () => {
  it('includes in-clearance bookings with gross net, null fee and clearance metadata', async () => {
    const res = await callGet()
    const body = await res.json()

    const tx = body.transactions.find((t: TxLike) => t.id === 'bk-c1')
    expect(tx).toMatchObject({
      status: 'in_clearance',
      session_date: '2026-07-26',
      booking_reference: 'CRK-2001',
      participant_name: 'Yuwin',
      coach_price_pence: 6000,
      fee_pence: null,
      net_pence: 6000,
      currency: 'GBP',
      payout_eligible_at: '2026-07-28T10:00:00Z',
      scheduled_at: null,
      processed_at: null,
    })
  })

  it('filters the clearance anti-join to active payout statuses and requires the embed empty', async () => {
    await callGet()
    expect(clearanceChain.select).toHaveBeenCalledWith(
      expect.stringContaining('payouts!left'),
    )
    expect(clearanceChain.in).toHaveBeenCalledWith('payouts.status', ['processing', 'paid', 'held'])
    expect(clearanceChain.is).toHaveBeenCalledWith('payouts', null)
    expect(clearanceChain.eq).toHaveBeenCalledWith('status', 'completed')
    expect(clearanceChain.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('maps payout statuses onto transaction statuses', async () => {
    const res = await callGet()
    const body = await res.json()
    const byId = new Map<string, TxLike>(
      body.transactions.map((t: TxLike) => [t.id, t]),
    )

    expect(byId.get('po-1')?.status).toBe('paid')
    expect(byId.get('po-2')?.status).toBe('transferring') // pending → in motion
    expect(byId.get('po-5')?.status).toBe('transferring')
    expect(byId.get('po-3')?.status).toBe('on_hold')
    expect(byId.get('po-3')?.held_reason).toBe('no_stripe_account')
    expect(byId.get('po-4')?.status).toBe('failed')
    expect(byId.get('po-4')?.failure_reason).toBe('transfer declined')
  })

  it('derives fee_pence for payout rows and coalesces participant names', async () => {
    const res = await callGet()
    const body = await res.json()
    const byId = new Map<string, TxLike>(
      body.transactions.map((t: TxLike) => [t.id, t]),
    )

    // fee = gross − net, integer pence
    expect(byId.get('po-1')?.fee_pence).toBe(80)
    expect(byId.get('po-1')?.net_pence).toBe(3920)
    // orphan payout → no gross → no fee, fallback participant
    expect(byId.get('po-2')?.fee_pence).toBeNull()
    expect(byId.get('po-2')?.participant_name).toBe('Player')
    // coalesce: child name → player user name → participant snapshot → 'Player'
    expect(byId.get('po-1')?.participant_name).toBe('Aarav Shah')
    expect(byId.get('po-4')?.participant_name).toBe('Maya Perera')
    expect(byId.get('po-3')?.participant_name).toBe('Guest Kid')
    expect(byId.get('po-5')?.participant_name).toBe('Player')
  })

  it('sorts transactions newest session first, unknown dates last', async () => {
    const res = await callGet()
    const body = await res.json()
    const dates = body.transactions.map((t: TxLike) => t.session_date)

    expect(dates).toEqual(['2026-07-26', '2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', null])
  })

  it('adds summary.in_clearance_pence and keeps every existing summary field', async () => {
    const res = await callGet()
    const body = await res.json()

    expect(body.summary.in_clearance_pence).toBe(6000)
    expect(body.summary).toMatchObject({
      total_earned_pence: 3920,
      pending_pence: 6911, // po-2 pending (2500) + po-5 processing (4411)
      currency: 'GBP',
    })
    expect(body.summary).toHaveProperty('this_month_pence')
    expect(body.summary).toHaveProperty('last_month_pence')
  })
})
