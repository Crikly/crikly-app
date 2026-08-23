/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    coachColour: '#0d9488',
    sportName: 'Cricket',
    sessionLine: 'Cricket · 1-to-1',
    whenLabel: 'Thursday, 27 August · 10am – 11am (1 hr)',
    shortWhenLabel: 'Thu 27 Aug, 10am',
    venueLabel: 'The Oval Cricket Centre, Kennington',
    participantLabel: 'Aiden',
    paidLabel: '£55.00',
    paymentMethodLabel: 'Card payment',
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

  it('shows booking reference and payment method in the detail panel', () => {
    render(<ParentBookingsClient data={makeData()} />)
    expect(screen.getByText('Booking reference')).toBeInTheDocument()
    expect(screen.getByText('CRK-2026-AAAA')).toBeInTheDocument()
    expect(screen.getByText('Payment method')).toBeInTheDocument()
    expect(screen.getByText('Card payment')).toBeInTheDocument()
  })

  it('paginates long lists to 10 with a Load more button', () => {
    const many = Array.from({ length: 23 }, (_, i) =>
      makeBooking({ id: `b${i}`, reference: `CRK-2026-${String(i).padStart(4, '0')}` }),
    )
    render(<ParentBookingsClient data={makeData({ upcoming: many })} />)
    // 10 visible in mobile list + 10 in desktop list = 20 coach-name hits
    // plus 1 in the detail panel.
    expect(screen.getAllByText('Ravi Patel')).toHaveLength(21)
    const loadMore = screen.getAllByRole('button', { name: 'Load more' })
    expect(loadMore.length).toBeGreaterThan(0)

    fireEvent.click(loadMore[0] as HTMLElement)
    expect(screen.getAllByText('Ravi Patel')).toHaveLength(41)

    fireEvent.click(screen.getAllByRole('button', { name: 'Load more' })[0] as HTMLElement)
    // All 23 now visible — the button disappears.
    expect(screen.getAllByText('Ravi Patel')).toHaveLength(47)
    expect(screen.queryAllByRole('button', { name: 'Load more' })).toHaveLength(0)
  })

  it('does not show Load more for lists of 10 or fewer', () => {
    render(<ParentBookingsClient data={makeData()} />)
    expect(screen.queryAllByRole('button', { name: 'Load more' })).toHaveLength(0)
  })

  it('opens the inline cancel panel and hides the action row while open', () => {
    render(<ParentBookingsClient data={makeData()} />)
    expect(screen.queryAllByTestId('cancel-panel')).toHaveLength(0)

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0] as HTMLElement)
    // Panel renders in the mobile card AND the desktop detail (same booking).
    expect(screen.getAllByTestId('cancel-panel').length).toBeGreaterThan(0)
    // The mobile card's action row hides while expanded (design).
    expect(screen.queryAllByRole('button', { name: 'Cancel' })).toHaveLength(0)

    fireEvent.click(screen.getAllByRole('button', { name: 'Keep booking' })[0] as HTMLElement)
    expect(screen.queryAllByTestId('cancel-panel')).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Cancel' }).length).toBeGreaterThan(0)
  })

  it('hides the Cancel affordance when the coach allows no cancellations', () => {
    const noCancel = makeBooking({ allowsCancel: false, cancellationWindowHours: 0 })
    render(<ParentBookingsClient data={makeData({ upcoming: [noCancel] })} />)
    expect(screen.queryAllByRole('button', { name: 'Cancel' })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: 'Cancel booking' })).toHaveLength(0)
    // Add to calendar still offered.
    expect(screen.getAllByText('Add to calendar').length).toBeGreaterThan(0)
  })

  it('renders the refunded cancelled state after a confirmed cancel', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ status: 'cancelled', refunded: true }),
    } as unknown as Response)

    render(<ParentBookingsClient data={makeData()} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0] as HTMLElement)
    fireEvent.click(
      screen.getAllByTestId('confirm-cancel-button')[0] as HTMLElement,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0)
    })
    expect(
      screen.getAllByText(
        '£55.00 refund on its way — it usually arrives within 5 working days.',
      ).length,
    ).toBeGreaterThan(0)
    // Panel closed; no further cancel affordance on the cancelled card.
    expect(screen.queryAllByTestId('cancel-panel')).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: 'Cancel' })).toHaveLength(0)
  })

  it('renders the no-refund cancelled line when the API reports refunded: false', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ status: 'cancelled', refunded: false }),
    } as unknown as Response)

    render(<ParentBookingsClient data={makeData()} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0] as HTMLElement)
    fireEvent.click(
      screen.getAllByTestId('confirm-cancel-button')[0] as HTMLElement,
    )

    await waitFor(() => {
      expect(
        screen.getAllByText('This booking was cancelled. No refund was due.').length,
      ).toBeGreaterThan(0)
    })
  })

  it('offers Add to calendar for upcoming non-cancelled bookings only', () => {
    render(<ParentBookingsClient data={makeData()} />)
    expect(screen.getAllByText('Add to calendar').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: 'Past sessions' }))
    expect(screen.queryAllByText('Add to calendar')).toHaveLength(0)
  })
})

// ── PROGRAMME-BOOKINGS-LIST — programme enrolment entries ────────────────────

function makeProgrammeItem(overrides: Partial<ParentBookingItem> = {}): ParentBookingItem {
  return makeBooking({
    id: 'e1',
    reference: 'CRK-2026-3ZTMHM',
    kind: 'programme',
    sessionLine: 'Cricket · Programme · Summer Cricket Camp',
    whenLabel: '4 sessions · Sat 5 Sept – Sat 26 Sept',
    shortWhenLabel: '4 sessions from Sat 5 Sept',
    sessionDatesLine: 'Sat 5 Sept, Sat 12 Sept, Sat 19 Sept, Sat 26 Sept',
    allowsCancel: false,
    cancellationWindowHours: 0,
    icsVenue: null,
    ...overrides,
  })
}

describe('ParentBookingsClient — programme enrolments', () => {
  it('renders a programme entry alongside a regular booking', () => {
    render(
      <ParentBookingsClient
        data={makeData({ upcoming: [makeBooking(), makeProgrammeItem()] })}
      />,
    )
    expect(screen.getAllByText('Cricket · Programme · Summer Cricket Camp').length).toBeGreaterThan(0)
    expect(screen.getAllByText('4 sessions · Sat 5 Sept – Sat 26 Sept').length).toBeGreaterThan(0)
    // The regular booking still renders untouched next to it.
    expect(screen.getAllByText('Cricket · 1-to-1').length).toBeGreaterThan(0)
  })

  it('offers no Cancel and no Add to calendar on a programme entry', () => {
    render(<ParentBookingsClient data={makeData({ upcoming: [makeProgrammeItem()] })} />)
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).not.toBeInTheDocument()
  })

  it('labels the reference "Enrolment reference" and shows the session dates tile', () => {
    render(<ParentBookingsClient data={makeData({ upcoming: [makeProgrammeItem()] })} />)
    expect(screen.getByText('Enrolment reference')).toBeInTheDocument()
    expect(screen.getAllByText('CRK-2026-3ZTMHM').length).toBeGreaterThan(0)
    expect(screen.getByText('Session dates')).toBeInTheDocument()
    expect(
      screen.getByText('Sat 5 Sept, Sat 12 Sept, Sat 19 Sept, Sat 26 Sept'),
    ).toBeInTheDocument()
  })

  it('keeps "Booking reference" and the calendar button for regular bookings — regression guard', () => {
    render(<ParentBookingsClient data={makeData()} />)
    expect(screen.getByText('Booking reference')).toBeInTheDocument()
    expect(screen.queryByText('Enrolment reference')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add to calendar' }).length).toBeGreaterThan(0)
  })
})
