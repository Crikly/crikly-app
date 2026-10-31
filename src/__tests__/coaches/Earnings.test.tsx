/** @jest-environment jsdom */
// C-PAY-06: Earnings redesign — 3 summary cards, client-side status pills +
// date-range filtering, and the unified transaction list (every completed
// session and where its money is: in clearance, transferring, paid, failed,
// on hold).

import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'

// UI-DATE-PICKER: the calendar popover is exercised in its own component's
// tests — here it is stubbed to a plain input so the date-range FILTERING
// logic stays deterministic (same precedent as EditProgramme-conflict.test).
jest.mock('@/components/ui', () => ({
  DatePicker: ({ value, onChange, placeholder }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
  }) => (
    <input
      data-testid="datepicker-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

import { Earnings } from '@/components/coach/Earnings'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TRANSACTIONS = [
  {
    id: 'bk-c1',
    status: 'in_clearance',
    session_date: '2026-07-26',
    booking_reference: 'CRK-2001',
    participant_name: 'Yuwin',
    coach_price_pence: 6000,
    fee_pence: null,
    net_pence: 6000,
    payout_eligible_at: '2026-07-28T10:00:00Z',
    scheduled_at: null,
    processed_at: null,
    held_reason: null,
    failure_reason: null,
  },
  {
    id: 'po-5',
    status: 'transferring',
    session_date: '2026-07-23',
    booking_reference: 'CRK-1005',
    participant_name: 'Isla',
    coach_price_pence: 6000,
    fee_pence: 119,
    net_pence: 5881,
    payout_eligible_at: '2026-07-25T10:00:00Z',
    scheduled_at: '2026-07-25T10:00:00Z',
    processed_at: null,
    held_reason: null,
    failure_reason: null,
  },
  {
    id: 'po-1',
    status: 'paid',
    session_date: '2026-07-21',
    booking_reference: 'CRK-1001',
    participant_name: 'Noah',
    coach_price_pence: 4500,
    fee_pence: 89,
    net_pence: 4411,
    payout_eligible_at: '2026-07-23T10:00:00Z',
    scheduled_at: '2026-07-23T10:00:00Z',
    processed_at: '2026-07-23T11:00:00Z',
    held_reason: null,
    failure_reason: null,
  },
  {
    id: 'po-4',
    status: 'failed',
    session_date: '2026-07-19',
    booking_reference: 'CRK-1004',
    participant_name: 'Maya',
    coach_price_pence: 6000,
    fee_pence: 119,
    net_pence: 5881,
    payout_eligible_at: '2026-07-21T10:00:00Z',
    scheduled_at: '2026-07-21T10:00:00Z',
    processed_at: null,
    held_reason: null,
    failure_reason: 'transfer declined',
  },
  {
    id: 'po-3',
    status: 'on_hold',
    session_date: '2026-07-18',
    booking_reference: 'CRK-1003',
    participant_name: 'Rohan',
    coach_price_pence: 3000,
    fee_pence: 59,
    net_pence: 2941,
    payout_eligible_at: '2026-07-20T10:00:00Z',
    scheduled_at: '2026-07-20T10:00:00Z',
    processed_at: null,
    held_reason: 'no_stripe_account',
    failure_reason: null,
  },
]

const EARNINGS_RESPONSE = {
  summary: {
    total_earned_pence: 386420,
    pending_pence: 5881,
    this_month_pence: 41267,
    last_month_pence: 0,
    in_clearance_pence: 6000,
    currency: 'GBP',
  },
  transactions: TRANSACTIONS,
}

function stubFetch(response: Record<string, unknown> = EARNINGS_RESPONSE) {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/coaches/earnings')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response),
      } as Response)
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`))
  }) as jest.Mock
}

afterEach(() => {
  jest.clearAllMocks()
})

// ── Summary cards ─────────────────────────────────────────────────────────────

describe('Earnings — summary cards', () => {
  it('renders This month, In clearance and All time from the summary', async () => {
    stubFetch()
    render(<Earnings />)

    expect(await screen.findByTestId('summary-this-month')).toHaveTextContent('£412.67')
    expect(screen.getByTestId('summary-in-clearance')).toHaveTextContent('£60.00')
    expect(screen.getByTestId('summary-all-time')).toHaveTextContent('£3,864.20')
    expect(screen.getByText('Every session and where its money is right now.')).toBeInTheDocument()
  })
})

// ── Transaction list ──────────────────────────────────────────────────────────

describe('Earnings — transaction list', () => {
  it('renders every transaction with reference, participant, net amount and badge', async () => {
    stubFetch()
    render(<Earnings />)

    const rows = await screen.findAllByTestId('transaction-row')
    expect(rows).toHaveLength(5)
    expect(screen.getByTestId('transaction-count')).toHaveTextContent('5 sessions')

    expect(screen.getByText('CRK-2001')).toBeInTheDocument()
    expect(screen.getByText('Yuwin')).toBeInTheDocument()
    expect(screen.getAllByText('£58.81')).toHaveLength(2) // transferring + failed rows
    // Badge per row (the filter pills carry the same labels, so scope to rows)
    expect(within(rows[0]).getByText('In clearance')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Transferring')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Paid')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Failed')).toBeInTheDocument()
    expect(within(rows[4]).getByText('On hold')).toBeInTheDocument()
  })

  it('shows no fee line on in-clearance rows and gross − fee for the rest', async () => {
    stubFetch()
    render(<Earnings />)
    const rows = await screen.findAllByTestId('transaction-row')

    // In-clearance: gross shown as the amount, no fee line at all — the
    // page-level clearance note explains fees instead
    const clearanceRow = rows[0]
    expect(within(clearanceRow).getByText('£60.00')).toBeInTheDocument()
    expect(within(clearanceRow).queryByText(/fee/)).not.toBeInTheDocument()
    expect(within(clearanceRow).getByText('Releasing 28 Jul')).toBeInTheDocument()

    // Paid: net bold figure + derived fee line
    const paidRow = rows[2]
    expect(within(paidRow).getByText('£44.11')).toBeInTheDocument()
    expect(within(paidRow).getByText('£45.00 − £0.89 fee')).toBeInTheDocument()
  })

  it('shows the clearance fee note only when an in-clearance transaction exists', async () => {
    stubFetch()
    render(<Earnings />)
    await screen.findAllByTestId('transaction-row')

    expect(screen.getByTestId('clearance-fee-note')).toHaveTextContent(
      'Stripe processing fees are deducted at transfer. Your final payout may vary slightly by card type.',
    )

    // The note keys off the FULL transaction list, not the filtered view
    fireEvent.click(screen.getByRole('button', { name: 'Paid' }))
    expect(screen.getByTestId('clearance-fee-note')).toBeInTheDocument()
  })

  it('hides the clearance fee note when nothing is in clearance', async () => {
    stubFetch({
      ...EARNINGS_RESPONSE,
      transactions: TRANSACTIONS.filter((t) => t.status !== 'in_clearance'),
    })
    render(<Earnings />)
    await screen.findAllByTestId('transaction-row')

    expect(screen.queryByTestId('clearance-fee-note')).not.toBeInTheDocument()
  })

  it('shows the action sub-texts for failed and on-hold rows', async () => {
    stubFetch()
    render(<Earnings />)
    await screen.findAllByTestId('transaction-row')

    expect(screen.getByText('Action needed')).toBeInTheDocument()
    expect(screen.getByText('Connect Stripe to release')).toBeInTheDocument()
  })

  // BUG-50 / T-20: Paid = Crikly's transfer to the coach's Stripe account
  // succeeded. The row says so, and a page note explains the onward bank step.
  it('shows the Stripe-account sub-text on paid rows only', async () => {
    stubFetch()
    render(<Earnings />)
    const rows = await screen.findAllByTestId('transaction-row')

    expect(within(rows[2]).getByText('Paid')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Sent to your Stripe account')).toBeInTheDocument()
    expect(screen.getAllByText('Sent to your Stripe account')).toHaveLength(1)
    // Transferring rows keep no sub-text
    expect(within(rows[1]).queryByText(/Stripe account/)).not.toBeInTheDocument()
  })

  it('shows the paid note only when a paid transaction exists, keyed off the full list', async () => {
    stubFetch()
    render(<Earnings />)
    await screen.findAllByTestId('transaction-row')

    expect(screen.getByTestId('paid-note')).toHaveTextContent(
      'Paid means we have sent the money to your Stripe account. Stripe pays it to your bank on your payout schedule.',
    )

    // Filtering the paid row out of view does not hide the note
    fireEvent.click(screen.getByRole('button', { name: 'Failed' }))
    expect(screen.getByTestId('paid-note')).toBeInTheDocument()
  })

  it('hides the paid note when nothing is paid', async () => {
    stubFetch({
      ...EARNINGS_RESPONSE,
      transactions: TRANSACTIONS.filter((t) => t.status !== 'paid'),
    })
    render(<Earnings />)
    await screen.findAllByTestId('transaction-row')

    expect(screen.queryByTestId('paid-note')).not.toBeInTheDocument()
    expect(screen.queryByText('Sent to your Stripe account')).not.toBeInTheDocument()
  })
})

// ── Filtering ─────────────────────────────────────────────────────────────────

describe('Earnings — client-side filtering', () => {
  it('filters by status pill (single-select) and updates the count', async () => {
    stubFetch()
    render(<Earnings />)
    await screen.findAllByTestId('transaction-row')

    fireEvent.click(screen.getByRole('button', { name: 'Paid' }))

    const rows = screen.getAllByTestId('transaction-row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('CRK-1001')).toBeInTheDocument()
    expect(screen.getByTestId('transaction-count')).toHaveTextContent('1 session')

    // Single-select: switching pills replaces the filter
    fireEvent.click(screen.getByRole('button', { name: 'In clearance' }))
    expect(screen.getAllByTestId('transaction-row')).toHaveLength(1)
    expect(screen.getByText('CRK-2001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getAllByTestId('transaction-row')).toHaveLength(5)
  })

  it('filters by date range on session_date', async () => {
    stubFetch()
    render(<Earnings />)
    await screen.findAllByTestId('transaction-row')

    const fromPicker = within(screen.getByTestId('filter-from-date')).getByTestId('datepicker-input')
    const toPicker = within(screen.getByTestId('filter-to-date')).getByTestId('datepicker-input')
    fireEvent.change(fromPicker, { target: { value: '2026-07-20' } })
    fireEvent.change(toPicker, { target: { value: '2026-07-23' } })

    const rows = screen.getAllByTestId('transaction-row')
    expect(rows).toHaveLength(2) // 23 Jul + 21 Jul
    expect(screen.getByText('CRK-1005')).toBeInTheDocument()
    expect(screen.getByText('CRK-1001')).toBeInTheDocument()
    expect(screen.queryByText('CRK-2001')).not.toBeInTheDocument()

    // Clear affordance resets the range and restores every row
    fireEvent.click(screen.getByTestId('filter-clear-dates'))
    expect(screen.getAllByTestId('transaction-row')).toHaveLength(5)
    expect(screen.queryByTestId('filter-clear-dates')).not.toBeInTheDocument()
  })

  it('shows the filter-aware empty state when nothing matches', async () => {
    stubFetch({ ...EARNINGS_RESPONSE, transactions: TRANSACTIONS.filter((t) => t.status !== 'failed') })
    render(<Earnings />)
    await screen.findAllByTestId('transaction-row')

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }))

    expect(screen.queryAllByTestId('transaction-row')).toHaveLength(0)
    expect(screen.getByText('No failed transactions yet')).toBeInTheDocument()
    expect(screen.getByText('Try a different filter or widen the date range.')).toBeInTheDocument()
    expect(screen.getByTestId('transaction-count')).toHaveTextContent('0 sessions')
  })
})

// ── TECH-06: programme-enrolment payout rows ─────────────────────────────────

const PROGRAMME_TRANSACTIONS = [
  {
    id: 'po-e1',
    status: 'transferring',
    session_date: '2026-10-16',
    booking_reference: 'CRK-2026-E00001',
    participant_name: 'Aarav',
    coach_price_pence: 13500,
    fee_pence: 223,
    net_pence: 13277,
    payout_eligible_at: null,
    scheduled_at: '2026-10-16T09:30:00Z',
    processed_at: '2026-10-16T10:05:00Z',
    held_reason: null,
    failure_reason: null,
    kind: 'programme',
    programme_name: 'Summer Cricket Camp',
  },
  {
    id: 'po-e2',
    status: 'on_hold',
    session_date: '2026-10-15',
    booking_reference: 'CRK-2026-E00002',
    participant_name: 'Participant',
    coach_price_pence: 5000,
    fee_pence: 95,
    net_pence: 4905,
    payout_eligible_at: null,
    scheduled_at: '2026-10-15T09:30:00Z',
    processed_at: null,
    held_reason: 'no_stripe_account',
    failure_reason: null,
    kind: 'programme',
    programme_name: null,
  },
  {
    id: 'po-e3',
    status: 'failed',
    session_date: '2026-10-14',
    booking_reference: 'CRK-2026-E00003',
    participant_name: 'Maya',
    coach_price_pence: 2500,
    fee_pence: 119,
    net_pence: 2381,
    payout_eligible_at: null,
    scheduled_at: '2026-10-14T09:30:00Z',
    processed_at: null,
    held_reason: null,
    failure_reason: 'transfer declined',
    kind: 'programme',
    programme_name: 'Winter Nets',
  },
]

describe('Earnings — programme-enrolment payouts (TECH-06)', () => {
  it('renders a programme row with its label, participant, reference, net and badge', async () => {
    stubFetch({ ...EARNINGS_RESPONSE, transactions: [PROGRAMME_TRANSACTIONS[0], ...TRANSACTIONS] })
    render(<Earnings />)
    const rows = await screen.findAllByTestId('transaction-row')
    expect(rows).toHaveLength(6)

    const row = rows[0]
    expect(within(row).getByTestId('programme-label')).toHaveTextContent('Programme · Summer Cricket Camp')
    expect(within(row).getByText('Aarav')).toBeInTheDocument()
    expect(within(row).getByText('CRK-2026-E00001')).toBeInTheDocument()
    expect(within(row).getByText('£132.77')).toBeInTheDocument()
    expect(within(row).getByText('£135.00 − £2.23 fee')).toBeInTheDocument()
    expect(within(row).getByText('Transferring')).toBeInTheDocument()
    expect(within(row).getByText('Fri 16 Oct')).toBeInTheDocument()
  })

  it('booking rows carry no programme label', async () => {
    stubFetch()
    render(<Earnings />)
    const rows = await screen.findAllByTestId('transaction-row')
    for (const row of rows) {
      expect(within(row).queryByTestId('programme-label')).not.toBeInTheDocument()
    }
  })

  it('held and failed programme rows use the same wording as bookings, and a missing title falls back', async () => {
    stubFetch({ ...EARNINGS_RESPONSE, transactions: PROGRAMME_TRANSACTIONS })
    render(<Earnings />)
    const rows = await screen.findAllByTestId('transaction-row')
    expect(rows).toHaveLength(3)

    expect(within(rows[1]).getByTestId('programme-label')).toHaveTextContent('Programme · Programme')
    expect(within(rows[1]).getByText('On hold')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Connect Stripe to release')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Failed')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Action needed')).toBeInTheDocument()
    expect(screen.queryByTestId('clearance-fee-note')).not.toBeInTheDocument()
    expect(screen.queryByTestId('paid-note')).not.toBeInTheDocument()
  })

  it('programme rows take part in status and date filtering', async () => {
    stubFetch({ ...EARNINGS_RESPONSE, transactions: [...PROGRAMME_TRANSACTIONS, ...TRANSACTIONS] })
    render(<Earnings />)
    await screen.findAllByTestId('transaction-row')

    fireEvent.click(screen.getByRole('button', { name: 'On hold' }))
    expect(screen.getAllByTestId('transaction-row')).toHaveLength(2) // po-e2 + po-3
    expect(screen.getByTestId('transaction-count')).toHaveTextContent('2 sessions')

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    const [from] = screen.getAllByTestId('datepicker-input')
    fireEvent.change(from, { target: { value: '2026-10-01' } })
    expect(screen.getAllByTestId('transaction-row')).toHaveLength(3) // the three programme rows
  })

  it('renders the empty state when there are no transactions at all', async () => {
    stubFetch({ ...EARNINGS_RESPONSE, transactions: [] })
    render(<Earnings />)
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
    expect(screen.queryAllByTestId('transaction-row')).toHaveLength(0)
  })
})
