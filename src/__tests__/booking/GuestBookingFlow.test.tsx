/** @jest-environment jsdom */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestBookingFlow } from '@/components/booking/GuestBookingFlow'
import type { BookingSummary } from '@/components/booking/BookingSummaryCard'

jest.mock('next/link', () => {
  const MockLink = ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})

const STUB: BookingSummary = {
  coachName: 'Alex Stuart',
  sportLabel: 'Cricket',
  sessionDate: 'Saturday, 27 June',
  sessionTime: '10:00am · 60 minutes',
  sessionType: '1-to-1 technical session',
  sessionFeePence: 4000,
  platformFeePence: 400,
}

const COACH_ID = 'coach-abc-123'

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

// ── checkout view ──────────────────────────────────────────────────────────

describe('GuestBookingFlow — checkout view', () => {
  it('renders the coach name', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    expect(screen.getAllByText('Alex Stuart').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the sport pill', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    expect(screen.getAllByText('Cricket').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Pay buttons with the formatted total', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    // Two DOM slots: desktop fused (hidden on mobile) + mobile bottom (lg:hidden)
    const payButtons = screen.getAllByRole('button', { name: /Pay £44\.00/i })
    expect(payButtons).toHaveLength(2)
  })

  it('does NOT show the confirmation view on initial render', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    expect(screen.queryByText("You're all booked!")).not.toBeInTheDocument()
  })

  it('does NOT show an error banner when no initialError is supplied', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders the full-name input', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument()
  })

  it('renders the email input', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument()
  })
})

// ── slot_taken error ───────────────────────────────────────────────────────

describe('GuestBookingFlow — slot_taken error', () => {
  it('shows at least one slot-taken alert', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} initialError="slot_taken" />)
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
  })

  it('banner contains the "just booked by someone else" message', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} initialError="slot_taken" />)
    const alert = screen.getAllByRole('alert')[0]
    expect(
      within(alert).getByText(/This time slot was just booked by someone else/i)
    ).toBeInTheDocument()
  })

  it('banner has a "Choose another time" link to /coaches/{coachId}', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} initialError="slot_taken" />)
    const alert = screen.getAllByRole('alert')[0]
    const link = within(alert).getByRole('link', { name: /Choose another time/i })
    expect(link).toHaveAttribute('href', `/coaches/${COACH_ID}`)
  })

  it('form field values persist when error banner is visible', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} initialError="slot_taken" />)

    const nameInput = screen.getByLabelText(/Full name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'James Holder')

    const emailInput = screen.getByLabelText(/Email address/i)
    await user.clear(emailInput)
    await user.type(emailInput, 'james@example.com')

    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
    expect(nameInput).toHaveValue('James Holder')
    expect(emailInput).toHaveValue('james@example.com')
  })
})

// ── payment error ──────────────────────────────────────────────────────────

describe('GuestBookingFlow — payment error', () => {
  it('shows a payment failure alert', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} initialError="payment" />)
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
  })

  it("banner contains the \"couldn't be completed\" message", () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} initialError="payment" />)
    const alert = screen.getAllByRole('alert')[0]
    expect(within(alert).getByText(/Payment couldn't be completed/i)).toBeInTheDocument()
  })

  it('payment error does NOT show "Choose another time"', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} initialError="payment" />)
    const alert = screen.getAllByRole('alert')[0]
    expect(
      within(alert).queryByRole('link', { name: /Choose another time/i })
    ).not.toBeInTheDocument()
  })

  it('clicking dismiss removes the error banner', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} initialError="payment" />)
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
    await user.click(screen.getAllByRole('button', { name: /Dismiss error/i })[0])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ── view toggle ────────────────────────────────────────────────────────────

describe('GuestBookingFlow — view toggle', () => {
  it('clicking Pay switches to the confirmation view', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])
    expect(screen.getByText("You're all booked!")).toBeInTheDocument()
  })

  it('confirmation shows the booking reference', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])
    expect(screen.getByText('CRK-7F3A9K')).toBeInTheDocument()
  })

  it('Pay buttons are removed after confirmation', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])
    expect(screen.queryByRole('button', { name: /Pay £44\.00/i })).not.toBeInTheDocument()
  })

  it('form inputs are removed after confirmation', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])
    expect(screen.queryByLabelText(/Full name/i)).not.toBeInTheDocument()
  })

  it('confirmation shows the "Booking reference" label', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])
    expect(screen.getByText('Booking reference')).toBeInTheDocument()
  })
})

// ── email in confirmation ──────────────────────────────────────────────────

describe('GuestBookingFlow — email in confirmation', () => {
  it('shows the typed email address in the confirmation message', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    await user.type(screen.getByLabelText(/Email address/i), 'sarah@example.com')
    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])
    expect(screen.getByText('sarah@example.com')).toBeInTheDocument()
  })

  it('shows "your email" fallback when no email is typed', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} />)
    await user.click(screen.getAllByRole('button', { name: /Pay £44\.00/i })[0])
    expect(screen.getByText('your email')).toBeInTheDocument()
  })
})
