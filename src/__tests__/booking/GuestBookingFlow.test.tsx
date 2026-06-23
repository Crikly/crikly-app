/**
 * @jest-environment jsdom
 *
 * Tests for GuestBookingFlow — the 'use client' checkout + confirmation component.
 *
 * The checkout layout renders the Pay block and the error banner in two
 * responsive slots (fused into the summary card on desktop, stacked at the
 * page bottom on mobile). jsdom does not apply the Tailwind responsive
 * visibility classes, so both copies are present in the DOM — tests use
 * getAllBy* and act on the first match.
 *
 * Covers:
 *   1. Checkout view: coach name, sport pill, Pay button with total
 *   2. Form persistence on error (critical): typing does not reset the form
 *   3. Slot-taken banner: role="alert", message, "Choose another time" link
 *   4. Payment error banner: copy + dismiss removes it
 *   5. View toggle: Pay → confirmation; checkout form gone
 *   6. Confirmation: typed email appears in the copy
 */

import React from 'react'

// next/link renders an <a> tag; mock it to avoid needing the full Next.js
// router context in a jsdom environment.
jest.mock('next/link', () => {
  const MockLink = ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestBookingFlow } from '@/components/booking/GuestBookingFlow'
import type { BookingSummary } from '@/components/booking/BookingSummaryCard'

const STUB_SUMMARY: BookingSummary = {
  coachName: 'Alex Stuart',
  sportLabel: 'Cricket',
  sessionDate: 'Saturday, 27 June',
  sessionTime: '10:00am · 60 minutes',
  sessionType: '1-to-1 technical session',
  sessionFeePence: 4000, // £40.00
  platformFeePence: 400, // £4.00 — 10% on top (BR-01, BR-02)
}

const STUB_COACH_ID = 'coach-abc-123'

beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
  Object.defineProperty(navigator, 'share', {
    value: jest.fn().mockResolvedValue(undefined),
    configurable: true,
  })
})

afterEach(() => {
  jest.clearAllMocks()
})

// ============================================================================
// 1. Checkout view — initial render
// ============================================================================

describe('GuestBookingFlow — checkout view', () => {
  it('renders the coach name from the summary', () => {
    render(<GuestBookingFlow coachId={STUB_COACH_ID} summary={STUB_SUMMARY} />)
    expect(screen.getByText('Alex Stuart')).toBeInTheDocument()
  })

  it('renders the sport pill label (Cricket)', () => {
    render(<GuestBookingFlow coachId={STUB_COACH_ID} summary={STUB_SUMMARY} />)
    expect(screen.getByText('Cricket')).toBeInTheDocument()
  })

  it('renders a Pay button with the formatted total in each responsive slot', () => {
    render(<GuestBookingFlow coachId={STUB_COACH_ID} summary={STUB_SUMMARY} />)
    // total = 4000 + 400 = 4400 → £44.00. Two slots: desktop fused + mobile.
    const payButtons = screen.getAllByRole('button', { name: /Pay £44\.00/i })
    expect(payButtons).toHaveLength(2)
  })

  it('does NOT show the confirmation view on initial render', () => {
    render(<GuestBookingFlow coachId={STUB_COACH_ID} summary={STUB_SUMMARY} />)
    expect(screen.queryByText("You're all booked!")).not.toBeInTheDocument()
  })

  it('does NOT show an error banner when no initialError is supplied', () => {
    render(<GuestBookingFlow coachId={STUB_COACH_ID} summary={STUB_SUMMARY} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ============================================================================
// 2 + 3. Form persistence on error — slot_taken variant (critical requirement)
// ============================================================================

describe('GuestBookingFlow — form persistence on error (slot_taken)', () => {
  it('shows the slot-taken alert banner when initialError="slot_taken"', () => {
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
        initialError="slot_taken"
      />,
    )
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
  })

  it('banner contains the "just booked by someone else" message', () => {
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
        initialError="slot_taken"
      />,
    )
    const alert = screen.getAllByRole('alert')[0]
    expect(
      within(alert).getByText(/This time slot was just booked by someone else/i),
    ).toBeInTheDocument()
  })

  it('banner has a "Choose another time" link pointing to /coaches/{coachId}', () => {
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
        initialError="slot_taken"
      />,
    )
    const alert = screen.getAllByRole('alert')[0]
    const link = within(alert).getByRole('link', { name: /Choose another time/i })
    expect(link).toHaveAttribute('href', `/coaches/${STUB_COACH_ID}`)
  })

  it('typed field values persist when the slot-taken banner is already shown', async () => {
    const user = userEvent.setup()
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
        initialError="slot_taken"
      />,
    )

    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)

    const nameInput = screen.getByLabelText(/Full name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'James Holder')

    const emailInput = screen.getByLabelText(/Email address/i)
    await user.clear(emailInput)
    await user.type(emailInput, 'james@example.com')

    // Banner still present — form state must NOT reset on error
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
    expect(nameInput).toHaveValue('James Holder')
    expect(emailInput).toHaveValue('james@example.com')
  })

  it('typed values persist across re-render with the error still set', async () => {
    const user = userEvent.setup()
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
        initialError="slot_taken"
      />,
    )

    const nameInput = screen.getByLabelText(/Full name/i)
    await user.type(nameInput, 'Ada Lovelace')

    expect(nameInput).toHaveValue('Ada Lovelace')
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// 4. Error banner — payment error variant
// ============================================================================

describe('GuestBookingFlow — payment error banner', () => {
  it('shows the payment failure banner when initialError="payment"', () => {
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
        initialError="payment"
      />,
    )
    const alert = screen.getAllByRole('alert')[0]
    expect(
      within(alert).getByText(/Payment couldn't be completed/i),
    ).toBeInTheDocument()
  })

  it('payment error banner does NOT show the "Choose another time" link', () => {
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
        initialError="payment"
      />,
    )
    const alert = screen.getAllByRole('alert')[0]
    expect(
      within(alert).queryByRole('link', { name: /Choose another time/i }),
    ).not.toBeInTheDocument()
  })

  it('dismissing the error banner removes it from the DOM', async () => {
    const user = userEvent.setup()
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
        initialError="payment"
      />,
    )
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)

    await user.click(screen.getAllByRole('button', { name: /Dismiss error/i })[0])

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ============================================================================
// 5. View toggle — Pay button transitions to confirmation view
// ============================================================================

describe('GuestBookingFlow — view toggle on Pay', () => {
  it('clicking Pay switches to the confirmation view', async () => {
    // STUB: handlePay advances synchronously today; once P-00c-API wires the
    // real Stripe flow this will need to await PaymentIntent confirmation.
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={STUB_COACH_ID} summary={STUB_SUMMARY} />)

    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])

    expect(screen.getByText("You're all booked!")).toBeInTheDocument()
  })

  it('the booking reference is shown in the confirmation view', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={STUB_COACH_ID} summary={STUB_SUMMARY} />)

    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])

    expect(screen.getByText('CRK-7F3A9K')).toBeInTheDocument()
  })

  it('the checkout form is no longer visible after Pay is clicked', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={STUB_COACH_ID} summary={STUB_SUMMARY} />)

    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])

    expect(
      screen.queryByRole('button', { name: /Pay £44\.00/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Full name/i)).not.toBeInTheDocument()
  })

  it('the booking reference section label reads "Booking reference"', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={STUB_COACH_ID} summary={STUB_SUMMARY} />)

    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])

    expect(screen.getByText('Booking reference')).toBeInTheDocument()
  })
})

// ============================================================================
// 6. Confirmation — typed email appears in confirmation copy
// ============================================================================

describe('GuestBookingFlow — email in confirmation copy', () => {
  it('shows the typed email address in the confirmation message', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={STUB_COACH_ID} summary={STUB_SUMMARY} />)

    const emailInput = screen.getByLabelText(/Email address/i)
    await user.type(emailInput, 'sarah@example.com')

    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])

    expect(screen.getByText('sarah@example.com')).toBeInTheDocument()
  })

  it('shows "your email" as fallback when no email was typed', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={STUB_COACH_ID} summary={STUB_SUMMARY} />)

    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])

    expect(screen.getByText('your email')).toBeInTheDocument()
  })
})
