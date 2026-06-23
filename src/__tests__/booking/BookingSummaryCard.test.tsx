/**
 * @jest-environment jsdom
 *
 * Tests for BookingSummaryCard and the formatPence utility.
 *
 * Covers:
 *   - formatPence: integer pence → GBP string (BR-10: prices as integers)
 *   - checkout variant: session fee, platform fee with derived %, and total
 *   - paid variant: shows "Paid" and total only — no fee breakdown
 *   - Coach name and sport pill rendered in both variants
 */

import { render, screen } from '@testing-library/react'
import {
  BookingSummaryCard,
  formatPence,
  type BookingSummary,
} from '@/components/booking/BookingSummaryCard'

// ----------------------------------------------------------------------------
// Shared stub — Alex Stuart / Cricket / sessionFee 4000p / platformFee 400p
// matches the placeholder data used in src/app/book/[coachId]/page.tsx
// ----------------------------------------------------------------------------
const STUB_SUMMARY: BookingSummary = {
  coachName: 'Alex Stuart',
  sportLabel: 'Cricket',
  sessionDate: 'Saturday, 27 June',
  sessionTime: '10:00am · 60 minutes',
  sessionType: '1-to-1 technical session',
  sessionFeePence: 4000, // £40.00
  platformFeePence: 400, // £4.00  →  10% of session fee (BR-01, BR-02)
}

// ============================================================================
// formatPence
// ============================================================================

describe('formatPence', () => {
  it('formats 4000 pence as £40.00', () => {
    expect(formatPence(4000)).toBe('£40.00')
  })

  it('formats 400 pence as £4.00', () => {
    expect(formatPence(400)).toBe('£4.00')
  })

  it('formats 4400 pence (sessionFee + platformFee) as £44.00', () => {
    // Total must equal the sum of the two integer pence values — never a float
    const total = STUB_SUMMARY.sessionFeePence + STUB_SUMMARY.platformFeePence
    expect(total).toBe(4400)
    expect(Number.isInteger(total)).toBe(true)
    expect(formatPence(total)).toBe('£44.00')
  })

  it('formats 999 pence as £9.99', () => {
    expect(formatPence(999)).toBe('£9.99')
  })

  it('formats 0 pence as £0.00', () => {
    expect(formatPence(0)).toBe('£0.00')
  })

  it('formats 1 pence as £0.01', () => {
    expect(formatPence(1)).toBe('£0.01')
  })

  it('formats 10000 pence as £100.00', () => {
    expect(formatPence(10000)).toBe('£100.00')
  })
})

// ============================================================================
// BookingSummaryCard — checkout variant
// ============================================================================

describe('BookingSummaryCard checkout variant', () => {
  beforeEach(() => {
    render(<BookingSummaryCard summary={STUB_SUMMARY} variant="checkout" />)
  })

  it('renders the coach name', () => {
    expect(screen.getByText('Alex Stuart')).toBeInTheDocument()
  })

  it('renders the sport label as a teal pill', () => {
    expect(screen.getByText('Cricket')).toBeInTheDocument()
  })

  it('renders the session date', () => {
    expect(screen.getByText('Saturday, 27 June')).toBeInTheDocument()
  })

  it('renders "Session fee" with the formatted session fee amount', () => {
    expect(screen.getByText('Session fee')).toBeInTheDocument()
    expect(screen.getAllByText('£40.00').length).toBeGreaterThanOrEqual(1)
  })

  it('renders "Platform fee (10%)" derived from the pence ratio', () => {
    // feePercent = Math.round((400 / 4000) * 100) = 10
    expect(screen.getByText('Platform fee (10%)')).toBeInTheDocument()
    expect(screen.getAllByText('£4.00').length).toBeGreaterThanOrEqual(1)
  })

  it('renders "Total" with the combined session + platform fee amount', () => {
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getAllByText('£44.00').length).toBeGreaterThanOrEqual(1)
  })

  it('does NOT render "Paid"', () => {
    expect(screen.queryByText('Paid')).not.toBeInTheDocument()
  })

  it('derives a non-default commission percentage correctly (5%)', () => {
    // Use a summary where fee is 5% — ensures the label is computed, not hardcoded
    const summary5pct: BookingSummary = {
      ...STUB_SUMMARY,
      sessionFeePence: 4000,
      platformFeePence: 200, // 5% of 4000
    }
    const { unmount } = render(
      <BookingSummaryCard summary={summary5pct} variant="checkout" />,
    )
    expect(screen.getByText('Platform fee (5%)')).toBeInTheDocument()
    unmount()
  })
})

// ============================================================================
// BookingSummaryCard — paid variant
// ============================================================================

describe('BookingSummaryCard paid variant', () => {
  beforeEach(() => {
    render(<BookingSummaryCard summary={STUB_SUMMARY} variant="paid" />)
  })

  it('renders the coach name', () => {
    expect(screen.getByText('Alex Stuart')).toBeInTheDocument()
  })

  it('renders "Paid" status label', () => {
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('renders the total amount (sessionFee + platformFee)', () => {
    expect(screen.getByText('£44.00')).toBeInTheDocument()
  })

  it('does NOT render the "Session fee" line item', () => {
    expect(screen.queryByText('Session fee')).not.toBeInTheDocument()
  })

  it('does NOT render the "Platform fee" line item', () => {
    expect(screen.queryByText(/Platform fee/)).not.toBeInTheDocument()
  })

  it('does NOT render "Total" label (paid variant uses "Paid" instead)', () => {
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
  })
})
