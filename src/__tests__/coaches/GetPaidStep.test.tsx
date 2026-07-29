/** @jest-environment jsdom */
// UX-01 BUG 5: the Get Paid ONBOARDING step must reflect real Stripe Connect
// status — before this fix it rendered "Connect with Stripe" unconditionally,
// even for coaches who had already completed Stripe onboarding.
//
// Covered:
//   - Connected (charges + payouts enabled) → connected card with Go live
//     CTAs, no "Connect with Stripe" anywhere
//   - Not connected → connect card, no connected card
//   - Partially connected (payouts disabled) → still the connect card, same
//     readiness semantics as the go-live API gate
//   - UX-01 BUG 2: preview panel shows display_name, falling back to
//     full_name only when display_name is null

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import { GetPaidStep } from '@/components/coach/onboarding/GetPaidStep'

const PROFILE = {
  full_name: 'Lasith Jayarathne',
  display_name: 'Alex Stuart',
}

const CONNECTED_STATUS = {
  connected: true,
  charges_enabled: true,
  payouts_enabled: true,
  details_submitted: true,
  bank_name: 'Monzo Bank',
  bank_last4: '5678',
}

function stubFetch(
  status: Record<string, unknown>,
  profile: Record<string, unknown> = PROFILE,
) {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/payments/connect/onboard')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(status),
      } as Response)
    }
    if (url.includes('/api/coaches/profile')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(profile),
      } as Response)
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`))
  }) as jest.Mock
}

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState({}, '', '/coach/onboarding/get-paid')
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('GetPaidStep — Stripe already connected (UX-01 BUG 5)', () => {
  it('shows the connected card with Go live CTAs and no Connect with Stripe', async () => {
    stubFetch(CONNECTED_STATUS)
    render(<GetPaidStep />)

    expect(await screen.findByTestId('stripe-step-connected')).toBeInTheDocument()
    expect(screen.getByText('Stripe connected')).toBeInTheDocument()
    expect(screen.getByText(/bank account ending 5678/)).toBeInTheDocument()
    // card CTA + footer CTA both switch to Go live
    expect(screen.getAllByRole('button', { name: /Go live/ })).toHaveLength(2)
    expect(screen.queryByText(/Connect with Stripe/)).not.toBeInTheDocument()
    expect(screen.queryByText('Before you start')).not.toBeInTheDocument()
  })

  it('omits bank copy when Stripe returns no bank details', async () => {
    stubFetch({ ...CONNECTED_STATUS, bank_name: null, bank_last4: null })
    render(<GetPaidStep />)

    expect(await screen.findByTestId('stripe-step-connected')).toBeInTheDocument()
    expect(screen.getByText(/Your payout account is set up/)).toBeInTheDocument()
    expect(screen.queryByText(/bank account ending/)).not.toBeInTheDocument()
  })
})

describe('GetPaidStep — Stripe not connected', () => {
  it('shows the connect card and no connected card', async () => {
    stubFetch({ connected: false })
    render(<GetPaidStep />)

    expect(
      await screen.findByRole('button', { name: 'Connect with Stripe' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Before you start')).toBeInTheDocument()
    expect(screen.queryByTestId('stripe-step-connected')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Go live/ })).not.toBeInTheDocument()
  })

  it('treats a partially-enabled account as not ready (same rule as the go-live gate)', async () => {
    stubFetch({ ...CONNECTED_STATUS, payouts_enabled: false })
    render(<GetPaidStep />)

    expect(
      await screen.findByRole('button', { name: 'Connect with Stripe' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('stripe-step-connected')).not.toBeInTheDocument()
  })
})

describe('GetPaidStep — preview name (UX-01 BUG 2)', () => {
  it('shows display_name in the What parents see panel, not full_name', async () => {
    stubFetch(CONNECTED_STATUS)
    render(<GetPaidStep />)

    expect(await screen.findByText('Alex Stuart')).toBeInTheDocument()
    expect(screen.queryByText('Lasith Jayarathne')).not.toBeInTheDocument()
  })

  it('falls back to full_name when display_name is null', async () => {
    stubFetch(CONNECTED_STATUS, { full_name: 'Lasith Jayarathne', display_name: null })
    render(<GetPaidStep />)

    expect(await screen.findByText('Lasith Jayarathne')).toBeInTheDocument()
  })
})
