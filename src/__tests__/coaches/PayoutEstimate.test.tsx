/** @jest-environment jsdom */
// C-PAY-04 — the live payout-estimate line shown under every coach price
// input. Must render the estimated figure WITH the verbatim remark, and
// render nothing at all when no valid estimate exists (empty input, price
// consumed by the fee) so callers can mount it unconditionally.

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import { PayoutEstimate } from '@/components/coach/shared/PayoutEstimate'

describe('PayoutEstimate', () => {
  it('renders the estimated payout with the verbatim remark (£40.00 → £39.20)', () => {
    render(<PayoutEstimate pricePence={4000} />)

    expect(screen.getByTestId('payout-estimate')).toBeInTheDocument()
    expect(screen.getByText('£39.20')).toBeInTheDocument()
    expect(
      screen.getByText('Estimated. Actual payout may vary slightly by card type.'),
    ).toBeInTheDocument()
  })

  it('always formats the figure as £X.XX (pence ÷ 100 at render only)', () => {
    render(<PayoutEstimate pricePence={999} />)
    // 999 − (15 + 20) = 964p
    expect(screen.getByText('£9.64')).toBeInTheDocument()
  })

  it('renders nothing when the input is empty (null price)', () => {
    render(<PayoutEstimate pricePence={null} />)
    expect(screen.queryByTestId('payout-estimate')).not.toBeInTheDocument()
  })

  it('renders nothing when the fee consumes the price (no £0.00, no negatives)', () => {
    render(<PayoutEstimate pricePence={20} />)
    expect(screen.queryByTestId('payout-estimate')).not.toBeInTheDocument()
  })

  it('renders nothing for zero price', () => {
    render(<PayoutEstimate pricePence={0} />)
    expect(screen.queryByTestId('payout-estimate')).not.toBeInTheDocument()
  })
})
