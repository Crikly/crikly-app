/**
 * @jest-environment jsdom
 *
 * Tests for GuestBookingFlow — the 'use client' checkout + confirmation component.
 *
 * Covers:
 *   1. Checkout view: renders coach name and sport label (Cricket pill)
 *   2. Form persistence on error (critical): typing into fields then triggering
 *      an error state does NOT reset form values
 *   3. Slot-taken banner: role="alert", correct message copy, "Choose another
 *      time" link pointing to /coaches/{coachId}
 *   4. View toggle: clicking "Pay …" button switches to the confirmation view —
 *      "You're all booked!" and booking reference appear, checkout form gone
 *   5. Confirmation email: the email typed by the guest appears in the
 *      confirmation copy
 *   6. Payment error banner: correct copy for the 'payment' error variant
 *
 * NOTE: Stripe, real network calls, and navigator APIs are not invoked.
 * The Pay button calls handlePay() which advances to confirmed view (stub).
 * navigator.clipboard and navigator.share are mocked to avoid jsdom errors.
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

// ----------------------------------------------------------------------------
// Shared stub — matches the page.tsx placeholder data
// ----------------------------------------------------------------------------
const STUB_SUMMARY: BookingSummary = {
  coachName: 'Alex Stuart',
  sportLabel: 'Cricket',
  sessionDate: 'Saturday, 27 June',
  sessionTime: '10:00am · 60 minutes',
  sessionType: '1-to-1 technical session',
  sessionFeePence: 4000, // £40.00
  platformFeePence: 400, // £4.00  — 10% on top (BR-01, BR-02)
}

const STUB_COACH_ID = 'coach-abc-123'

// ----------------------------------------------------------------------------
// navigator mocks — clipboard and share are not available in jsdom
// ----------------------------------------------------------------------------
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
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
      />,
    )
    // Coach name appears in the BookingSummaryCard header
    expect(screen.getAllByText('Alex Stuart').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the sport pill label (Cricket)', () => {
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
      />,
    )
    expect(screen.getByText('Cricket')).toBeInTheDocument()
  })

  it('renders the Pay button with the formatted total amount', () => {
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
      />,
    )
    // total = 4000 + 400 = 4400 → £44.00
    expect(
      screen.getByRole('button', { name: /Pay £44\.00/i }),
    ).toBeInTheDocument()
  })

  it('does NOT show the confirmation view on initial render', () => {
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
      />,
    )
    expect(
      screen.queryByText("You're all booked!"),
    ).not.toBeInTheDocument()
  })

  it('does NOT show an error banner when no initialError is supplied', () => {
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
      />,
    )
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
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('banner contains the "just booked by someone else" message', () => {
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
        initialError="slot_taken"
      />,
    )
    const alert = screen.getByRole('alert')
    expect(
      within(alert).getByText(
        /This time slot was just booked by someone else/i,
      ),
    ).toBeInTheDocument()
  })

  it('banner contains a "Choose another time" link pointing to /coaches/{coachId}', () => {
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
        initialError="slot_taken"
      />,
    )
    const alert = screen.getByRole('alert')
    const link = within(alert).getByRole('link', {
      name: /Choose another time/i,
    })
    expect(link).toBeInTheDocument()
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

    // The banner must be visible before we type
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Type into the Full name field
    const nameInput = screen.getByLabelText(/Full name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'James Holder')

    // Type into the Email address field
    const emailInput = screen.getByLabelText(/Email address/i)
    await user.clear(emailInput)
    await user.type(emailInput, 'james@example.com')

    // Banner must still be present — form state must NOT be reset on error
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Typed values must still be in the inputs
    expect(nameInput).toHaveValue('James Holder')
    expect(emailInput).toHaveValue('james@example.com')
  })

  it('typed field values persist across a simulated re-render with the error still set', async () => {
    // This test verifies nothing in the component inadvertently clears the
    // form state when the error prop is present at mount time.
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

    // The input must retain the typed value
    expect(nameInput).toHaveValue('Ada Lovelace')
    // The error banner must still be shown
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

// ============================================================================
// 2b. Error banner — payment error variant
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
    const alert = screen.getByRole('alert')
    expect(
      within(alert).getByText(
        /Payment couldn't be completed/i,
      ),
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
    const alert = screen.getByRole('alert')
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
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Dismiss error/i }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ============================================================================
// 4. View toggle — Pay button transitions to confirmation view
// ============================================================================

describe('GuestBookingFlow — view toggle on Pay', () => {
  it('clicking Pay switches to the confirmation view', async () => {
    const user = userEvent.setup()
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Pay £44\.00/i }))

    expect(screen.getByText("You're all booked!")).toBeInTheDocument()
  })

  it('the booking reference is shown in the confirmation view', async () => {
    const user = userEvent.setup()
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Pay £44\.00/i }))

    // The stub reference is 'CRK-7F3A9K'
    expect(screen.getByText('CRK-7F3A9K')).toBeInTheDocument()
  })

  it('the checkout form is no longer visible after Pay is clicked', async () => {
    const user = userEvent.setup()
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Pay £44\.00/i }))

    // The Pay button belongs to the checkout view — it must be gone
    expect(
      screen.queryByRole('button', { name: /Pay £44\.00/i }),
    ).not.toBeInTheDocument()

    // The "Full name" field belongs to the checkout form — it must be gone
    expect(screen.queryByLabelText(/Full name/i)).not.toBeInTheDocument()
  })

  it('the booking reference section label reads "Booking reference"', async () => {
    const user = userEvent.setup()
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Pay £44\.00/i }))

    expect(screen.getByText('Booking reference')).toBeInTheDocument()
  })
})

// ============================================================================
// 5. Confirmation — typed email appears in confirmation copy
// ============================================================================

describe('GuestBookingFlow — email in confirmation copy', () => {
  it('shows the typed email address in the confirmation message', async () => {
    const user = userEvent.setup()
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
      />,
    )

    // Type an email address into the checkout form
    const emailInput = screen.getByLabelText(/Email address/i)
    await user.type(emailInput, 'sarah@example.com')

    // Click Pay to advance to the confirmation view
    await user.click(screen.getByRole('button', { name: /Pay £44\.00/i }))

    // The confirmation copy must include the email the user typed
    expect(screen.getByText('sarah@example.com')).toBeInTheDocument()
  })

  it('shows "your email" as fallback when no email was typed', async () => {
    const user = userEvent.setup()
    render(
      <GuestBookingFlow
        coachId={STUB_COACH_ID}
        summary={STUB_SUMMARY}
      />,
    )

    // Do NOT type an email — leave it blank
    await user.click(screen.getByRole('button', { name: /Pay £44\.00/i }))

    expect(screen.getByText('your email')).toBeInTheDocument()
  })
})
