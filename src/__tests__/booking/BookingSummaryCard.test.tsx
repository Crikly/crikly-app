/**
 * @jest-environment jsdom
 *
 * Tests for BookingSummaryCard — the presentational summary used on both the
 * guest checkout and confirmation screens, plus the formatPence helper.
 *
 * Covers:
 *   1. formatPence: integer pence → GBP string (BR-10)
 *   2. checkout variant: coach, sport pill, session rows, fee breakdown, total
 *   3. derived platform-fee percent (BR-02 — non-default rate stays correct)
 *   4. paid variant: "Paid" badge + settled total, no fee breakdown
 *   5. footer slot renders inside the checkout card (desktop fused Pay block)
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  BookingSummaryCard,
  formatPence,
  type BookingSummary,
} from '@/components/booking/BookingSummaryCard'

const STUB_SUMMARY: BookingSummary = {
  coachName: 'Alex Stuart',
  sportLabel: 'Cricket',
  sessionDate: 'Saturday, 27 June',
  sessionTime: '10:00am · 60 minutes',
  sessionType: '1-to-1 technical session',
  sessionFeePence: 4000, // £40.00
  platformFeePence: 400, // £4.00 — 10% on top (BR-01, BR-02)
}

// ============================================================================
// 1. formatPence
// ============================================================================

describe('formatPence', () => {
  it('formats whole pounds with two decimal places', () => {
    expect(formatPence(4000)).toBe('£40.00')
  })

  it('formats a combined total', () => {
    expect(formatPence(4400)).toBe('£44.00')
  })

  it('formats zero', () => {
    expect(formatPence(0)).toBe('£0.00')
  })

  it('formats odd pence values', () => {
    expect(formatPence(999)).toBe('£9.99')
  })
})

// ============================================================================
// 2 + 3. checkout variant
// ============================================================================

describe('BookingSummaryCard — checkout variant', () => {
  it('renders the coach name', () => {
    render(<BookingSummaryCard summary={STUB_SUMMARY} variant="checkout" />)
    expect(screen.getByText('Alex Stuart')).toBeInTheDocument()
  })

  it('renders the sport label as a pill', () => {
    render(<BookingSummaryCard summary={STUB_SUMMARY} variant="checkout" />)
    expect(screen.getByText('Cricket')).toBeInTheDocument()
  })

  it('renders the session date, time and type', () => {
    render(<BookingSummaryCard summary={STUB_SUMMARY} variant="checkout" />)
    expect(screen.getByText('Saturday, 27 June')).toBeInTheDocument()
    expect(screen.getByText('10:00am · 60 minutes')).toBeInTheDocument()
    expect(screen.getByText('1-to-1 technical session')).toBeInTheDocument()
  })

  it('renders the session fee and platform fee rows', () => {
    render(<BookingSummaryCard summary={STUB_SUMMARY} variant="checkout" />)
    expect(screen.getByText('Session fee')).toBeInTheDocument()
    expect(screen.getByText(/£40\.00/)).toBeInTheDocument()
    expect(screen.getByText(/£4\.00/)).toBeInTheDocument()
  })

  it('renders the platform fee label with the default 10% derived from the values', () => {
    render(<BookingSummaryCard summary={STUB_SUMMARY} variant="checkout" />)
    expect(screen.getByText('Platform fee (10%)')).toBeInTheDocument()
  })

  it('derives a non-default platform fee percent from the pence values (BR-02)', () => {
    const custom: BookingSummary = {
      ...STUB_SUMMARY,
      sessionFeePence: 5000,
      platformFeePence: 750, // 15%
    }
    render(<BookingSummaryCard summary={custom} variant="checkout" />)
    expect(screen.getByText('Platform fee (15%)')).toBeInTheDocument()
  })

  it('renders the Total label and combined total', () => {
    render(<BookingSummaryCard summary={STUB_SUMMARY} variant="checkout" />)
    expect(screen.getByText('Total')).toBeInTheDocument()
    // total = 4000 + 400 = 4400
    expect(screen.getByText('£44.00')).toBeInTheDocument()
  })

  it('renders a provided footer inside the checkout card', () => {
    render(
      <BookingSummaryCard
        summary={STUB_SUMMARY}
        variant="checkout"
        footer={<div>fused-footer</div>}
      />,
    )
    expect(screen.getByText('fused-footer')).toBeInTheDocument()
  })
})

// ============================================================================
// 4. paid variant
// ============================================================================

describe('BookingSummaryCard — paid variant', () => {
  it('renders the "Paid" badge and the settled total', () => {
    render(<BookingSummaryCard summary={STUB_SUMMARY} variant="paid" />)
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('£44.00')).toBeInTheDocument()
  })

  it('does NOT render the fee breakdown rows', () => {
    render(<BookingSummaryCard summary={STUB_SUMMARY} variant="paid" />)
    expect(screen.queryByText('Session fee')).not.toBeInTheDocument()
    expect(screen.queryByText(/Platform fee/)).not.toBeInTheDocument()
  })

  it('does NOT render a footer even if one is passed', () => {
    render(
      <BookingSummaryCard
        summary={STUB_SUMMARY}
        variant="paid"
        footer={<div>should-not-show</div>}
      />,
    )
    expect(screen.queryByText('should-not-show')).not.toBeInTheDocument()
  })
})
