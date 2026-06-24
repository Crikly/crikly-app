/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  BookingSummaryCard,
  formatPence,
  type BookingSummary,
} from '@/components/booking/BookingSummaryCard'

const STUB: BookingSummary = {
  coachName: 'Alex Stuart',
  sportLabel: 'Cricket',
  sessionDate: 'Saturday, 27 June',
  sessionTime: '10:00am · 60 minutes',
  sessionType: '1-to-1 technical session',
  sessionFeePence: 4000,
  platformFeePence: 400,
}

// ── formatPence ────────────────────────────────────────────────────────────

describe('formatPence', () => {
  it('formats pence as GBP with 2 decimal places', () => {
    expect(formatPence(4400)).toBe('£44.00')
  })
  it('formats zero correctly', () => {
    expect(formatPence(0)).toBe('£0.00')
  })
  it('formats 100p as £1.00', () => {
    expect(formatPence(100)).toBe('£1.00')
  })
  it('formats amounts with pence correctly', () => {
    expect(formatPence(999)).toBe('£9.99')
  })
})

// ── checkout variant ───────────────────────────────────────────────────────

describe('BookingSummaryCard — checkout variant', () => {
  it('renders the coach name', () => {
    render(<BookingSummaryCard summary={STUB} variant="checkout" />)
    expect(screen.getByText('Alex Stuart')).toBeInTheDocument()
  })

  it('renders the sport pill', () => {
    render(<BookingSummaryCard summary={STUB} variant="checkout" />)
    expect(screen.getByText('Cricket')).toBeInTheDocument()
  })

  it('renders session date', () => {
    render(<BookingSummaryCard summary={STUB} variant="checkout" />)
    expect(screen.getByText('Saturday, 27 June')).toBeInTheDocument()
  })

  it('renders session time', () => {
    render(<BookingSummaryCard summary={STUB} variant="checkout" />)
    expect(screen.getByText('10:00am · 60 minutes')).toBeInTheDocument()
  })

  it('renders session type', () => {
    render(<BookingSummaryCard summary={STUB} variant="checkout" />)
    expect(screen.getByText('1-to-1 technical session')).toBeInTheDocument()
  })

  it('renders the session fee', () => {
    render(<BookingSummaryCard summary={STUB} variant="checkout" />)
    expect(screen.getByText('£40.00')).toBeInTheDocument()
  })

  it('renders the platform fee label with percentage', () => {
    render(<BookingSummaryCard summary={STUB} variant="checkout" />)
    expect(screen.getByText('Platform fee (10%)')).toBeInTheDocument()
  })

  it('renders the platform fee amount', () => {
    render(<BookingSummaryCard summary={STUB} variant="checkout" />)
    expect(screen.getByText('£4.00')).toBeInTheDocument()
  })

  it('renders the formatted total', () => {
    render(<BookingSummaryCard summary={STUB} variant="checkout" />)
    expect(screen.getByText('£44.00')).toBeInTheDocument()
  })

  it('renders footer content when provided', () => {
    render(
      <BookingSummaryCard
        summary={STUB}
        variant="checkout"
        footer={<button>Pay now</button>}
      />
    )
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeInTheDocument()
  })

  it('does NOT render the Paid badge in checkout variant', () => {
    render(<BookingSummaryCard summary={STUB} variant="checkout" />)
    expect(screen.queryByText(/^paid$/i)).not.toBeInTheDocument()
  })
})

// ── paid variant ───────────────────────────────────────────────────────────

describe('BookingSummaryCard — paid variant', () => {
  it('renders the Paid badge', () => {
    render(<BookingSummaryCard summary={STUB} variant="paid" />)
    expect(screen.getByText(/^paid$/i)).toBeInTheDocument()
  })

  it('renders the total amount', () => {
    render(<BookingSummaryCard summary={STUB} variant="paid" />)
    expect(screen.getByText('£44.00')).toBeInTheDocument()
  })

  it('does NOT render the fee breakdown', () => {
    render(<BookingSummaryCard summary={STUB} variant="paid" />)
    expect(screen.queryByText('Session fee')).not.toBeInTheDocument()
    expect(screen.queryByText(/Platform fee/)).not.toBeInTheDocument()
  })

  it('does NOT render footer content when provided', () => {
    render(
      <BookingSummaryCard
        summary={STUB}
        variant="paid"
        footer={<button>Hidden footer</button>}
      />
    )
    expect(screen.queryByRole('button', { name: 'Hidden footer' })).not.toBeInTheDocument()
  })
})

// ── edge cases ─────────────────────────────────────────────────────────────

describe('BookingSummaryCard — edge cases', () => {
  it('shows 0% when platform fee is zero', () => {
    render(
      <BookingSummaryCard
        summary={{ ...STUB, platformFeePence: 0 }}
        variant="checkout"
      />
    )
    expect(screen.getByText('Platform fee (0%)')).toBeInTheDocument()
  })

  it('renders total correctly when platform fee is zero', () => {
    render(
      <BookingSummaryCard
        summary={{ ...STUB, platformFeePence: 0 }}
        variant="checkout"
      />
    )
    // session fee and total are both £40.00 when platformFeePence=0
    expect(screen.getAllByText('£40.00').length).toBeGreaterThanOrEqual(2)
  })
})
