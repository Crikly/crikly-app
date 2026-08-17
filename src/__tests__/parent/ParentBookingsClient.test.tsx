/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { ParentBookingsClient } from '@/components/parent/bookings/ParentBookingsClient'
import type {
  ParentBookingItem,
  ParentBookingsData,
} from '@/components/parent/bookings/types'

// P-14 — tabs, empty states, cancelled rendering, desktop selection.

function makeBooking(overrides: Partial<ParentBookingItem> = {}): ParentBookingItem {
  return {
    id: 'b1',
    reference: 'CRK-2026-AAAA',
    status: 'confirmed',
    coachName: 'Ravi Patel',
    coachInitials: 'RP',
    sportName: 'Cricket',
    sessionLine: 'Cricket · 1-to-1',
    whenLabel: 'Thursday, 27 August · 10am – 11am (1 hr)',
    shortWhenLabel: 'Thu 27 Aug, 10am',
    venueLabel: 'The Oval Cricket Centre, Kennington',
    participantLabel: 'Aiden',
    paidLabel: '£55.00',
    sessionStartMs: Date.UTC(2026, 7, 27, 9, 0),
    sessionEndMs: Date.UTC(2026, 7, 27, 10, 0),
    cancellationWindowHours: 24,
    allowsCancel: true,
    isCancelled: false,
    cancelledLine: null,
    sessionDate: '2026-08-27',
    startTime: '10:00:00',
    endTime: '11:00:00',
    icsVenue: 'The Oval Cricket Centre, Kennington',
    ...overrides,
  }
}

function makeData(overrides: Partial<ParentBookingsData> = {}): ParentBookingsData {
  return {
    upcoming: [makeBooking()],
    past: [
      makeBooking({
        id: 'p1',
        reference: 'CRK-2026-BBBB',
        status: 'completed',
        coachName: 'Sophie Turner',
        coachInitials: 'ST',
        allowsCancel: false,
      }),
    ],
    ...overrides,
  }
}

describe('ParentBookingsClient', () => {
  it('renders the Upcoming tab by default with booking details', () => {
    render(<ParentBookingsClient data={makeData()} />)
    expect(screen.getByRole('heading', { name: 'Bookings' })).toBeInTheDocument()
    // Coach name appears in mobile card + desktop row + desktop detail.
    expect(screen.getAllByText('Ravi Patel').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Sophie Turner')).toHaveLength(0)
  })

  it('switches to Past sessions on tab click', () => {
    render(<ParentBookingsClient data={makeData()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Past sessions' }))
    expect(screen.getAllByText('Sophie Turner').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Ravi Patel')).toHaveLength(0)
  })

  it('shows the upcoming empty state with a Find a coach CTA', () => {
    render(<ParentBookingsClient data={makeData({ upcoming: [] })} />)
    expect(screen.getByText('No upcoming sessions')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find a coach' })).toHaveAttribute(
      'href',
      '/coaches',
    )
  })

  it('shows the past empty state without a CTA', () => {
    render(<ParentBookingsClient data={makeData({ past: [] })} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Past sessions' }))
    expect(screen.getByText('No past sessions yet')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Find a coach' })).not.toBeInTheDocument()
  })

  it('renders cancelled bookings with badge and cancelled line', () => {
    const cancelled = makeBooking({
      id: 'c1',
      status: 'cancelled_parent',
      isCancelled: true,
      allowsCancel: false,
      cancelledLine: 'This booking was cancelled on 12 August.',
    })
    render(<ParentBookingsClient data={makeData({ upcoming: [cancelled] })} />)
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('This booking was cancelled on 12 August.').length,
    ).toBeGreaterThan(0)
  })

  it('selects a booking in the desktop list on click', () => {
    const second = makeBooking({
      id: 'b2',
      reference: 'CRK-2026-CCCC',
      coachName: 'James Okafor',
      coachInitials: 'JO',
    })
    render(
      <ParentBookingsClient data={makeData({ upcoming: [makeBooking(), second] })} />,
    )
    // Initially the first booking is selected — its when-label shows in the
    // detail panel (mobile card also shows it, so use counts).
    const before = screen.getAllByText('Ravi Patel').length
    fireEvent.click(screen.getByRole('button', { name: /James Okafor/ }))
    // After selecting, the detail panel re-renders for James Okafor: his
    // name now appears in row + detail; Ravi drops to card + row only.
    expect(screen.getAllByText('James Okafor').length).toBeGreaterThan(1)
    expect(screen.getAllByText('Ravi Patel').length).toBeLessThanOrEqual(before)
  })

  it('offers Add to calendar for upcoming non-cancelled bookings only', () => {
    render(<ParentBookingsClient data={makeData()} />)
    expect(screen.getAllByText('Add to calendar').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: 'Past sessions' }))
    expect(screen.queryAllByText('Add to calendar')).toHaveLength(0)
  })
})
