/** @jest-environment jsdom */
// C-PAY-06: Get Paid is payment setup only. The earnings fetch, hero figures
// (Next payout / Total earned) and the Upcoming payouts section moved to the
// Earnings page's unified transaction list.
//
// Covered:
//   - The page never calls GET /api/coaches/earnings and renders none of the
//     removed earnings sections
//   - Connected → status card with real bank destination + Active chip,
//     payout account card, Update bank account → Stripe login-link route
//   - Bank details absent → truthful fallbacks ("Payouts via Stripe",
//     "Bank account" / "Connected via Stripe")
//   - Not connected → "Stripe not connected" card with Connect Stripe CTA,
//     no payout account card

import React from 'react'
import { render, screen } from '@testing-library/react'
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

function stubFetch(status: Record<string, unknown> = CONNECTED_STATUS) {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/payments/connect/onboard')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(status),
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

// ── C-PAY-06: earnings removed from this page ─────────────────────────────────

describe('GetPaid — payment setup only (C-PAY-06)', () => {
  it('never fetches earnings and renders none of the removed sections', async () => {
    stubFetch()
    render(<GetPaid />)
    await screen.findByTestId('stripe-status-connected')

    const fetched = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]))
    expect(fetched.some((url) => url.includes('/api/coaches/earnings'))).toBe(false)

    expect(screen.queryByText(/Next payout/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Total earned/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Upcoming payouts/i)).not.toBeInTheDocument()
  })

  it('shows the payment-setup subtitle and the payout explainer', async () => {
    stubFetch()
    render(<GetPaid />)
    await screen.findByTestId('stripe-status-connected')

    expect(screen.getByText('Where your money goes and when it lands.')).toBeInTheDocument()
    expect(screen.getByText('How payouts work')).toBeInTheDocument()
    expect(screen.getByText('Session completed')).toBeInTheDocument()
    expect(screen.getByText('48hr processing')).toBeInTheDocument()
    expect(screen.getByText('Released to bank')).toBeInTheDocument()
  })
})

// ── Connected state ───────────────────────────────────────────────────────────

describe('GetPaid — connected (real Stripe bank details)', () => {
  it('shows the connected status card with real bank destination and Active chip', async () => {
    stubFetch()
    render(<GetPaid />)

    expect(await screen.findByTestId('payout-destination')).toHaveTextContent('Payouts to ****5678 · Monzo Bank')
    expect(screen.getByText('Stripe connected')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows the payout account card with real bank details', async () => {
    stubFetch()
    render(<GetPaid />)

    expect(await screen.findByTestId('payout-bank-name')).toHaveTextContent('Monzo Bank')
    expect(screen.getByTestId('payout-bank-last4')).toHaveTextContent('Account ending ****5678')
  })

  it('falls back to truthful copy when Stripe returns no bank details', async () => {
    stubFetch({ ...CONNECTED_STATUS, bank_name: null, bank_last4: null })
    render(<GetPaid />)

    expect(await screen.findByTestId('payout-destination')).toHaveTextContent('Payouts via Stripe')
    expect(screen.getByTestId('payout-bank-name')).toHaveTextContent('Bank account')
    expect(screen.getByTestId('payout-bank-last4')).toHaveTextContent('Connected via Stripe')
  })

  it('links Update bank account to the Stripe Express login-link route', async () => {
    stubFetch()
    render(<GetPaid />)

    const link = await screen.findByTestId('update-bank-account')
    expect(link).toHaveAttribute('href', '/api/payments/connect/login-link')
    expect(link).toHaveAttribute('target', '_blank')
  })
})

// ── Not connected state ───────────────────────────────────────────────────────

describe('GetPaid — not connected', () => {
  it('shows the not-connected card with a Connect Stripe CTA and no payout account card', async () => {
    stubFetch({ connected: false })
    render(<GetPaid />)

    expect(await screen.findByTestId('stripe-status-disconnected')).toHaveTextContent('Stripe not connected')
    expect(screen.getByText('Connect Stripe to receive payouts. Sessions stay on hold until you do.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Stripe' })).toBeInTheDocument()
    expect(screen.queryByTestId('payout-bank-name')).not.toBeInTheDocument()
    expect(screen.queryByText('Manage Stripe account')).not.toBeInTheDocument()
  })

  it('shows Finish setup when connected but charges/payouts are not enabled', async () => {
    stubFetch({ connected: true, charges_enabled: true, payouts_enabled: false })
    render(<GetPaid />)

    expect(await screen.findByTestId('stripe-status-disconnected')).toHaveTextContent('Finish your Stripe setup')
    expect(screen.getByRole('button', { name: 'Finish setup' })).toBeInTheDocument()
  })
})
