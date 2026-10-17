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

// TECH-06: programme-enrolment detail fetch (only issued when an enrolment
// payout row exists, so the pre-TECH-06 fixtures never hit it).
const enrolmentsChain = {
  select: jest.fn().mockReturnThis(),
  in: jest.fn(),
}

let bookingsCallCount = 0

const mockFrom = jest.fn((table: string) => {
  if (table === 'payouts') return payoutsChain
  if (table === 'group_programme_enrolments') return enrolmentsChain
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
  enrolmentsChain.select.mockReturnThis()
  enrolmentsChain.in.mockResolvedValue({ data: [], error: null })
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

// ─── TECH-06: programme-enrolment payouts ─────────────────────────────────────

const ENROLMENT_PAYOUT_ROWS = [
  {
    id: 'po-e1',
    booking_id: null,
    enrolment_id: 'en-1',
    amount_pence: 13277, // 13500 gross − 223p actual fee
    currency: 'GBP',
    status: 'processing',
    scheduled_at: '2026-10-16T09:30:00Z',
    processed_at: '2026-10-16T10:05:00Z',
    held_reason: null,
    failure_reason: null,
  },
  {
    id: 'po-e2',
    booking_id: null,
    enrolment_id: 'en-held',
    amount_pence: 4905,
    currency: 'GBP',
    status: 'held',
    scheduled_at: '2026-10-15T09:30:00Z',
    processed_at: null,
    held_reason: 'no_stripe_account',
    failure_reason: null,
  },
  {
    id: 'po-e3',
    booking_id: null,
    enrolment_id: 'en-failed',
    amount_pence: 2381,
    currency: 'GBP',
    status: 'failed',
    scheduled_at: '2026-10-14T09:30:00Z',
    processed_at: null,
    held_reason: null,
    failure_reason: 'transfer declined',
  },
  {
    id: 'po-orphan',
    booking_id: null, // defensive: neither id (should never exist — XOR) must not crash
    enrolment_id: null,
    amount_pence: 100,
    currency: 'GBP',
    status: 'pending',
    scheduled_at: '2026-10-13T09:30:00Z',
    processed_at: null,
    held_reason: null,
    failure_reason: null,
  },
]

const ENROLMENT_ROWS = [
  {
    id: 'en-1',
    enrolment_reference: 'CRK-2026-E00001',
    participant_name: 'Aarav Shah',
    coach_amount_pence: 13500,
    updated_at: '2026-10-16T09:30:00Z',
    group_programmes: { title: 'Summer Cricket Camp' },
  },
  {
    id: 'en-held',
    enrolment_reference: 'CRK-2026-E00002',
    participant_name: null, // → 'Participant'
    coach_amount_pence: 5000,
    updated_at: '2026-10-15T09:30:00Z',
    group_programmes: null, // programme title unreadable → null name
  },
  {
    id: 'en-failed',
    enrolment_reference: 'CRK-2026-E00003',
    participant_name: 'Maya Perera',
    coach_amount_pence: 2500,
    updated_at: '2026-10-14T09:30:00Z',
    group_programmes: { title: 'Winter Nets' },
  },
]

describe('GET /api/coaches/earnings — TECH-06 programme-enrolment payouts', () => {
  beforeEach(() => {
    payoutsChain.order.mockResolvedValue({ data: [...PAYOUT_ROWS, ...ENROLMENT_PAYOUT_ROWS], error: null })
    enrolmentsChain.in.mockResolvedValue({ data: ENROLMENT_ROWS, error: null })
  })

  it('selects enrolment_id from payouts and fetches enrolment details only for enrolment rows', async () => {
    await callGet()
    expect(payoutsChain.select).toHaveBeenCalledWith(expect.stringContaining('enrolment_id'))
    expect(enrolmentsChain.select).toHaveBeenCalledWith(expect.stringContaining('group_programmes(title)'))
    expect(enrolmentsChain.in).toHaveBeenCalledWith('id', ['en-1', 'en-held', 'en-failed'])
    // Booking batch still receives only booking ids — no nulls leak in.
    expect(historyChain.in).toHaveBeenCalledWith('id', ['bk-1', 'bk-orphan', 'bk-3', 'bk-4', 'bk-5'])
  })

  it('renders an enrolment payout with reference, participant, programme name and derived fee', async () => {
    const body = await (await callGet()).json()
    const tx = body.transactions.find((t: TxLike) => t.id === 'po-e1')
    expect(tx).toEqual({
      id: 'po-e1',
      status: 'transferring',
      session_date: '2026-10-16',
      booking_reference: 'CRK-2026-E00001',
      participant_name: 'Aarav Shah',
      coach_price_pence: 13500,
      fee_pence: 223,
      net_pence: 13277,
      currency: 'GBP',
      payout_eligible_at: null,
      scheduled_at: '2026-10-16T09:30:00Z',
      processed_at: '2026-10-16T10:05:00Z',
      held_reason: null,
      failure_reason: null,
      kind: 'programme',
      programme_name: 'Summer Cricket Camp',
    })
    const item = body.payouts.find((p: { id: string }) => p.id === 'po-e1')
    expect(item).toEqual({
      id: 'po-e1',
      booking_id: null,
      enrolment_id: 'en-1',
      booking_reference: 'CRK-2026-E00001',
      session_date: '2026-10-16',
      session_type: 'programme',
      coach_price_pence: 13500,
      amount_pence: 13277,
      currency: 'GBP',
      status: 'processing',
      scheduled_at: '2026-10-16T09:30:00Z',
      processed_at: '2026-10-16T10:05:00Z',
    })
  })

  it('maps held and failed enrolment payouts exactly like bookings', async () => {
    const body = await (await callGet()).json()
    const byId = new Map<string, TxLike & { kind?: string; programme_name?: string | null }>(
      body.transactions.map((t: TxLike) => [t.id, t]),
    )
    expect(byId.get('po-e2')).toMatchObject({ status: 'on_hold', held_reason: 'no_stripe_account', participant_name: 'Participant', programme_name: null, kind: 'programme', fee_pence: 95 })
    expect(byId.get('po-e3')).toMatchObject({ status: 'failed', failure_reason: 'transfer declined', programme_name: 'Winter Nets', fee_pence: 119 })
  })

  it('leaves booking payout items and transactions byte-identical (no kind / enrolment_id keys)', async () => {
    const body = await (await callGet()).json()
    const bookingTx = body.transactions.find((t: TxLike) => t.id === 'po-1')
    expect(bookingTx).not.toHaveProperty('kind')
    expect(bookingTx).not.toHaveProperty('programme_name')
    expect(bookingTx).toMatchObject({ booking_reference: 'CRK-1001', participant_name: 'Aarav Shah', fee_pence: 80 })
    const bookingItem = body.payouts.find((p: { id: string }) => p.id === 'po-1')
    expect(bookingItem).not.toHaveProperty('enrolment_id')
    expect(bookingItem).toMatchObject({ booking_id: 'bk-1', session_type: 'individual' })
  })

  it('tolerates a payout row with neither id without crashing', async () => {
    const res = await callGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    const orphan = body.transactions.find((t: TxLike) => t.id === 'po-orphan')
    expect(orphan).toMatchObject({ status: 'transferring', participant_name: 'Player', booking_reference: null, coach_price_pence: null, fee_pence: null, net_pence: 100 })
    expect(orphan).not.toHaveProperty('kind')
  })

  it('sorts bookings and programmes together, newest date first, unknown dates last', async () => {
    const body = await (await callGet()).json()
    const dates = body.transactions.map((t: TxLike) => t.session_date)
    expect(dates).toEqual(['2026-10-16', '2026-10-15', '2026-10-14', '2026-07-26', '2026-07-21', '2026-07-20', '2026-07-19', '2026-07-18', null, null])
  })

  it('counts enrolment payouts in the summary like any other payout', async () => {
    const body = await (await callGet()).json()
    // pending_pence: po-2 (2500) + po-5 (4411) + po-e1 processing (13277) + orphan pending (100)
    expect(body.summary.pending_pence).toBe(20288)
  })

  it('returns 500 when the enrolment detail fetch fails', async () => {
    enrolmentsChain.in.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const res = await callGet()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to fetch enrolment details' })
  })

  it('falls back to the pre-TECH-06 column list when payouts.enrolment_id does not exist yet', async () => {
    payoutsChain.order
      .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column payouts.enrolment_id does not exist' } })
      .mockResolvedValueOnce({ data: PAYOUT_ROWS, error: null })
    const res = await callGet()
    expect(res.status).toBe(200)
    expect(payoutsChain.select).toHaveBeenNthCalledWith(1, expect.stringContaining('enrolment_id'))
    expect(payoutsChain.select).toHaveBeenNthCalledWith(2, expect.not.stringContaining('enrolment_id'))
    expect(enrolmentsChain.in).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.payouts).toHaveLength(5)
    expect(body.payouts.find((p: { id: string }) => p.id === 'po-1')).not.toHaveProperty('enrolment_id')
  })
})
