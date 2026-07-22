/** @jest-environment jsdom */
// BUG-45: the Get Paid page previously rendered hardcoded stub data
// (£90.00 next payout, £1,240.00 total, Apr dates, "Lloyds Bank ****4242")
// regardless of environment. It must now render ONLY real data:
//   - earnings figures from GET /api/coaches/earnings (payouts table)
//   - bank details from GET /api/payments/connect/onboard (Stripe
//     external_accounts via bank_name/bank_last4)
//
// Covered:
//   - Empty earnings → "No pending payout · Complete sessions to earn",
//     £0.00 total, "No upcoming payouts" — and none of the old stub values
//   - Real earnings → pending sum, payout rows with real dates + status pills
//   - Earnings fetch failure → '—' total (never a fake £0.00), empty states
//   - Bank details present → shown in hero subtitle + payout account card
//   - Bank details absent → truthful fallbacks ("Payouts via Stripe",
//     "Bank account" / "Connected via Stripe")
//   - "Update bank account" links to the real Stripe login-link route

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

import { GetPaid } from '@/components/coach/GetPaid'

// ── Fetch stubs ───────────────────────────────────────────────────────────────

const CONNECTED_STATUS = {
  connected: true,
  charges_enabled: true,
  payouts_enabled: true,
  details_submitted: true,
  bank_name: 'Monzo Bank',
  bank_last4: '5678',
}

const EMPTY_EARNINGS = {
  summary: { total_earned_pence: 0, pending_pence: 0, this_month_pence: 0, last_month_pence: 0, currency: 'GBP' },
  payouts: [],
}

const REAL_EARNINGS = {
  summary: { total_earned_pence: 12000, pending_pence: 9000, this_month_pence: 0, last_month_pence: 0, currency: 'GBP' },
  // Newest-first, matching the real endpoint's scheduled_at DESC ordering —
  // the component must re-sort so the soonest payout renders first.
  payouts: [
    { id: 'po-2', amount_pence: 3000, status: 'pending', scheduled_at: '2026-07-25T10:00:00Z' },
    { id: 'po-1', amount_pence: 6000, status: 'processing', scheduled_at: '2026-07-23T10:00:00Z' },
    { id: 'po-3', amount_pence: 12000, status: 'paid', scheduled_at: '2026-07-01T10:00:00Z' },
  ],
}

function stubFetch(opts: {
  status?: Record<string, unknown>
  earnings?: Record<string, unknown>
  earningsFails?: boolean
}) {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/payments/connect/onboard')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(opts.status ?? CONNECTED_STATUS),
      } as Response)
    }
    if (url.includes('/api/coaches/earnings')) {
      if (opts.earningsFails) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(opts.earnings ?? EMPTY_EARNINGS),
      } as Response)
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`))
  }) as jest.Mock
}

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState({}, '', '/coach/get-paid')
})

afterEach(() => {
  jest.clearAllMocks()
})

// ── Empty state (Block 0 truth: no payouts wired yet) ─────────────────────────

describe('GetPaid — empty earnings (Block 0)', () => {
  it('shows the no-pending-payout empty state and £0.00 total', async () => {
    stubFetch({ earnings: EMPTY_EARNINGS })
    render(<GetPaid />)

    expect(await screen.findByTestId('next-payout-empty')).toHaveTextContent('No pending payout')
    expect(screen.getByText('Complete sessions to earn')).toBeInTheDocument()
    expect(screen.getByTestId('total-earned')).toHaveTextContent('£0.00')
    expect(screen.getByTestId('upcoming-payouts-empty')).toHaveTextContent('No upcoming payouts')
  })

  it('renders none of the old hardcoded stub values', async () => {
    stubFetch({ earnings: EMPTY_EARNINGS })
    render(<GetPaid />)
    await screen.findByTestId('next-payout-empty')

    expect(screen.queryByText(/£90\.00/)).not.toBeInTheDocument()
    expect(screen.queryByText(/£1,240\.00/)).not.toBeInTheDocument()
    expect(screen.queryByText(/£45\.00/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Lloyds Bank/)).not.toBeInTheDocument()
    expect(screen.queryByText(/4242/)).not.toBeInTheDocument()
    expect(screen.queryByText(/10 Apr/)).not.toBeInTheDocument()
  })
})

// ── Real earnings data ────────────────────────────────────────────────────────

describe('GetPaid — real earnings data', () => {
  it('shows the pending payout sum and real upcoming payout rows', async () => {
    stubFetch({ earnings: REAL_EARNINGS })
    render(<GetPaid />)

    expect(await screen.findByTestId('next-payout-amount')).toHaveTextContent('£90.00')
    // Soonest payout drives the release date, even though the endpoint
    // returns rows newest-first.
    expect(screen.getByText('Releasing Thu 23 Jul')).toBeInTheDocument()
    expect(screen.getByTestId('total-earned')).toHaveTextContent('£120.00')

    const list = screen.getByTestId('upcoming-payouts-list')
    // Re-sorted soonest-first: 23 Jul row renders before 25 Jul.
    expect(list.textContent?.indexOf('Thu 23 Jul')).toBeLessThan(list.textContent?.indexOf('Sat 25 Jul') ?? -1)
    expect(list).toHaveTextContent('£60.00')
    expect(list).toHaveTextContent('£30.00')
    expect(list).toHaveTextContent('Processing')
    expect(list).toHaveTextContent('Pending')
    // Real scheduled_at dates rendered
    expect(list).toHaveTextContent('Thu 23 Jul')
    expect(list).toHaveTextContent('Sat 25 Jul')
    // Paid rows are history, not upcoming
    expect(list).not.toHaveTextContent('£120.00')
    expect(screen.queryByTestId('upcoming-payouts-empty')).not.toBeInTheDocument()
  })
})

// ── Earnings fetch failure ────────────────────────────────────────────────────

describe('GetPaid — earnings fetch failure', () => {
  it('shows an em dash for total (never a fake £0.00) and the empty states', async () => {
    stubFetch({ earningsFails: true })
    render(<GetPaid />)

    expect(await screen.findByTestId('next-payout-empty')).toHaveTextContent('No pending payout')
    await waitFor(() => {
      expect(screen.getByTestId('total-earned')).toHaveTextContent('—')
    })
    expect(screen.getByTestId('upcoming-payouts-empty')).toBeInTheDocument()
  })
})

// ── Bank details ──────────────────────────────────────────────────────────────

describe('GetPaid — payout account (real Stripe bank details)', () => {
  it('shows the real bank name and last4 in the hero and the payout account card', async () => {
    stubFetch({ earnings: EMPTY_EARNINGS })
    render(<GetPaid />)

    expect(await screen.findByTestId('payout-destination')).toHaveTextContent('Payouts to ****5678 · Monzo Bank')
    expect(screen.getByTestId('payout-bank-name')).toHaveTextContent('Monzo Bank')
    expect(screen.getByTestId('payout-bank-last4')).toHaveTextContent('Account ending ****5678')
  })

  it('falls back to truthful copy when Stripe returns no bank details', async () => {
    stubFetch({
      status: { ...CONNECTED_STATUS, bank_name: null, bank_last4: null },
      earnings: EMPTY_EARNINGS,
    })
    render(<GetPaid />)

    expect(await screen.findByTestId('payout-destination')).toHaveTextContent('Payouts via Stripe')
    expect(screen.getByTestId('payout-bank-name')).toHaveTextContent('Bank account')
    expect(screen.getByTestId('payout-bank-last4')).toHaveTextContent('Connected via Stripe')
  })

  it('links Update bank account to the Stripe Express login-link route', async () => {
    stubFetch({ earnings: EMPTY_EARNINGS })
    render(<GetPaid />)

    const link = await screen.findByTestId('update-bank-account')
    expect(link).toHaveAttribute('href', '/api/payments/connect/login-link')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
