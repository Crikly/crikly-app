/** @jest-environment jsdom */
// P-14 Phase 3 — inline cancellation panel. Refund/no-refund copy variants,
// reason wiring, the API call contract, and error handling. No
// window.confirm anywhere — the panel IS the confirmation.

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CancelPanel, isRefundEligible } from '@/components/parent/bookings/CancelPanel'
import type { ParentBookingItem } from '@/components/parent/bookings/types'

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
    venueLabel: 'The Oval Cricket Centre',
    participantLabel: 'Aiden',
    paidLabel: '£55.00',
    paymentMethodLabel: 'Card payment',
    // Default: session 72h out with a 24h window → refund-eligible.
    sessionStartMs: Date.now() + 72 * 3_600_000,
    sessionEndMs: Date.now() + 73 * 3_600_000,
    cancellationWindowHours: 24,
    allowsCancel: true,
    isCancelled: false,
    cancelledLine: null,
    sessionDate: '2026-08-27',
    startTime: '10:00:00',
    endTime: '11:00:00',
    icsVenue: 'The Oval Cricket Centre',
    ...overrides,
  }
}

/** Session 2h out with a 24h window → cancellable, no refund. */
function insideWindowBooking(): ParentBookingItem {
  return makeBooking({
    sessionStartMs: Date.now() + 2 * 3_600_000,
    sessionEndMs: Date.now() + 3 * 3_600_000,
  })
}

function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response)
  global.fetch = fetchMock
  return fetchMock
}

afterEach(() => {
  jest.clearAllMocks()
})

describe('isRefundEligible', () => {
  it('is true earlier than window_hours before the start, false inside', () => {
    const booking = makeBooking()
    expect(isRefundEligible(booking, Date.now())).toBe(true)
    expect(isRefundEligible(insideWindowBooking(), Date.now())).toBe(false)
  })
})

describe('CancelPanel — copy variants', () => {
  it('within window: refund preview + "Cancel and refund"', () => {
    render(
      <CancelPanel booking={makeBooking()} onKeep={jest.fn()} onCancelled={jest.fn()} />,
    )
    expect(
      screen.getByText('You’ll receive a full refund of £55.00'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('confirm-cancel-button')).toHaveTextContent(
      'Cancel and refund',
    )
  })

  it('outside window: no-refund message + "Cancel session"', () => {
    render(
      <CancelPanel
        booking={insideWindowBooking()}
        onKeep={jest.fn()}
        onCancelled={jest.fn()}
      />,
    )
    expect(
      screen.getByText('Outside your coach’s cancellation window — no refund'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Your coach requires 24 hours’ notice for refunds.'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('confirm-cancel-button')).toHaveTextContent(
      'Cancel session',
    )
  })
})

describe('CancelPanel — actions', () => {
  it('Keep booking calls onKeep without any network call', () => {
    const onKeep = jest.fn()
    const fetchMock = mockFetch(200, {})
    render(<CancelPanel booking={makeBooking()} onKeep={onKeep} onCancelled={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Keep booking' }))
    expect(onKeep).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('confirm POSTs the selected reason and reports the refund result', async () => {
    const onCancelled = jest.fn()
    const fetchMock = mockFetch(200, { status: 'cancelled', refunded: true })
    render(
      <CancelPanel booking={makeBooking()} onKeep={jest.fn()} onCancelled={onCancelled} />,
    )

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'unwell' } })
    fireEvent.click(screen.getByTestId('confirm-cancel-button'))

    await waitFor(() => expect(onCancelled).toHaveBeenCalledWith({ refunded: true }))
    expect(fetchMock).toHaveBeenCalledWith('/api/parent/bookings/b1/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'unwell' }),
    })
  })

  it('sends reason null when none is selected', async () => {
    const fetchMock = mockFetch(200, { refunded: false })
    render(
      <CancelPanel booking={makeBooking()} onKeep={jest.fn()} onCancelled={jest.fn()} />,
    )
    fireEvent.click(screen.getByTestId('confirm-cancel-button'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      reason: null,
    })
  })

  it('shows the refund-specific error on refund_failed, keeping the panel open', async () => {
    const onCancelled = jest.fn()
    mockFetch(502, { error: 'refund_failed' })
    render(
      <CancelPanel booking={makeBooking()} onKeep={jest.fn()} onCancelled={onCancelled} />,
    )
    fireEvent.click(screen.getByTestId('confirm-cancel-button'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/refund couldn’t be processed/)
    })
    expect(onCancelled).not.toHaveBeenCalled()
  })

  it('converges silently when the booking is already cancelled elsewhere', async () => {
    const onCancelled = jest.fn()
    mockFetch(409, { error: 'already_cancelled' })
    render(
      <CancelPanel booking={makeBooking()} onKeep={jest.fn()} onCancelled={onCancelled} />,
    )
    fireEvent.click(screen.getByTestId('confirm-cancel-button'))
    await waitFor(() => expect(onCancelled).toHaveBeenCalledWith({ refunded: false }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the generic error on other failures', async () => {
    mockFetch(500, { error: 'internal_error' })
    render(
      <CancelPanel booking={makeBooking()} onKeep={jest.fn()} onCancelled={jest.fn()} />,
    )
    fireEvent.click(screen.getByTestId('confirm-cancel-button'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t cancel this booking/)
    })
  })
})
