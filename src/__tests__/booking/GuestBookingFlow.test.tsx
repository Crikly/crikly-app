/** @jest-environment jsdom */
// Rewritten for P-00c-API — GuestBookingFlow now requires a `checkout` prop
// (GuestCheckoutParams) and wraps checkout in Stripe <Elements>. This test
// mocks @stripe/react-stripe-js and @/lib/stripe/browser so no real Stripe
// network calls are made and the component renders in jsdom.
//
// Tests preserved from the prior version (adapted for new prop shape):
//   - checkout heading, summary fields, form inputs
//   - initialError banners (slot_taken / payment) and dismiss
//   - confirmation view after handlePay succeeds
//   - copy-reference-button / share-button testids
//
// New tests:
//   - handlePay — mocked fetch returns clientSecret + bookingReference,
//     mocked useStripe().confirmPayment resolves → confirmation view shown.
//   - handlePay — fetch returns 409 slot_taken → slot_taken error banner.

import React from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BookingSummary } from '@/components/booking/BookingSummaryCard'
import type { GuestCheckoutParams } from '@/components/booking/GuestBookingFlow'

// ── Stripe mocks (must appear before any component import) ───────────────────
//
// @stripe/react-stripe-js is mocked entirely. Elements passes children through.
// useStripe / useElements return minimal stub objects. PaymentElement and
// ExpressCheckoutElement render inert divs.

jest.mock('@stripe/react-stripe-js', () => {
  // No `require('react')` needed — the project's automatic JSX runtime
  // (tsconfig jsx: react-jsx) compiles the JSX below without React in scope.
  const mockSubmit = jest.fn().mockResolvedValue({ error: null })
  const mockConfirmPayment = jest.fn().mockResolvedValue({ error: null })

  return {
    Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    PaymentElement: () => <div data-testid="payment-element" />,
    ExpressCheckoutElement: ({ onConfirm }: { onConfirm?: () => void }) => (
      <div data-testid="express-checkout-element" onClick={onConfirm} />
    ),
    useStripe: () => ({ confirmPayment: mockConfirmPayment }),
    useElements: () => ({ submit: mockSubmit }),
    __mockSubmit: mockSubmit,
    __mockConfirmPayment: mockConfirmPayment,
  }
})

// @/lib/stripe/browser — return a resolved null promise (Stripe not loaded)
jest.mock('@/lib/stripe/browser', () => ({
  getStripePromise: () => Promise.resolve(null),
}))

// next/link — renders an <a> so href assertions work in jsdom
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

// Import the component AFTER mocks are in place
import { GuestBookingFlow } from '@/components/booking/GuestBookingFlow'

// Pull the stripe mock helpers (needed in handlePay tests)
import * as StripeMock from '@stripe/react-stripe-js'
const stripeModule = StripeMock as unknown as {
  __mockSubmit: jest.Mock
  __mockConfirmPayment: jest.Mock
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const STUB: BookingSummary = {
  coachName: 'Alex Stuart',
  sportLabel: 'Cricket',
  sessionDate: 'Saturday, 27 June',
  sessionTime: '10:00am · 60 minutes',
  sessionType: '1-to-1 technical session',
  sessionFeePence: 4000,
  platformFeePence: 400,
}

const CHECKOUT: GuestCheckoutParams = {
  coachId: 'coach-abc-123',
  sportId: 'sport-cricket-001',
  sessionType: 'individual',
  date: '2026-06-27',
  startTime: '10:00',
  pricePence: 4000,
  participantName: 'Yuwin',
  participantAge: 10,
}

const COACH_ID = 'coach-abc-123'

// ── Browser API stubs ─────────────────────────────────────────────────────────

beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
  Object.defineProperty(navigator, 'share', {
    value: jest.fn().mockResolvedValue(undefined),
    configurable: true,
  })
  // crypto.randomUUID used by the component for the idempotency token
  Object.defineProperty(global, 'crypto', {
    value: { randomUUID: jest.fn().mockReturnValue('test-uuid-1234') },
    configurable: true,
  })
})

afterEach(() => {
  jest.clearAllMocks()
})

// ── Checkout view ──────────────────────────────────────────────────────────────

describe('GuestBookingFlow — checkout view', () => {
  it('renders the coach name', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)
    expect(screen.getAllByText('Alex Stuart').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the sport pill', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)
    expect(screen.getAllByText('Cricket').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Pay buttons with the formatted total', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)
    // Two DOM slots: desktop fused (lg:block) + mobile bottom (lg:hidden)
    const payButtons = screen.getAllByTestId('pay-button')
    expect(payButtons.length).toBeGreaterThanOrEqual(1)
    // Each button text contains the formatted total
    expect(payButtons[0]).toHaveTextContent(/Pay £44\.00/i)
  })

  it('does NOT show the confirmation view on initial render', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)
    expect(screen.queryByText("You're all booked!")).not.toBeInTheDocument()
  })

  it('does NOT show an error banner when no initialError is supplied', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders the full-name input', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument()
  })

  it('renders the email input', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)
    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument()
  })

  it('renders the "Complete your booking" heading', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)
    expect(screen.getByRole('heading', { name: /Complete your booking/i })).toBeInTheDocument()
  })

  it('renders the Stripe PaymentElement placeholder', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)
    expect(screen.getByTestId('payment-element')).toBeInTheDocument()
  })

  it('renders the address field with data-testid="guest-address-input"', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)
    expect(screen.getByTestId('guest-address-input')).toBeInTheDocument()
  })
})

// ── slot_taken error ───────────────────────────────────────────────────────────

describe('GuestBookingFlow — slot_taken error', () => {
  it('shows at least one slot-taken alert', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} initialError="slot_taken" />)
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
  })

  it('banner contains the "just booked by someone else" message', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} initialError="slot_taken" />)
    const alert = screen.getAllByRole('alert')[0]
    expect(
      within(alert).getByText(/This time slot was just booked by someone else/i)
    ).toBeInTheDocument()
  })

  it('banner has a "Choose another time" link to /coaches/{coachId}', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} initialError="slot_taken" />)
    const alert = screen.getAllByRole('alert')[0]
    const link = within(alert).getByRole('link', { name: /Choose another time/i })
    expect(link).toHaveAttribute('href', `/coaches/${COACH_ID}`)
  })

  it('form field values persist when error banner is visible', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} initialError="slot_taken" />)

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

// ── payment error ──────────────────────────────────────────────────────────────

describe('GuestBookingFlow — payment error', () => {
  it('shows a payment failure alert', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} initialError="payment" />)
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
  })

  it('banner contains the "couldn\'t be completed" message', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} initialError="payment" />)
    const alert = screen.getAllByRole('alert')[0]
    expect(within(alert).getByText(/Payment couldn't be completed/i)).toBeInTheDocument()
  })

  it('payment error does NOT show "Choose another time"', () => {
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} initialError="payment" />)
    const alert = screen.getAllByRole('alert')[0]
    expect(
      within(alert).queryByRole('link', { name: /Choose another time/i })
    ).not.toBeInTheDocument()
  })

  it('clicking dismiss removes the error banner', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} initialError="payment" />)
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
    await user.click(screen.getAllByRole('button', { name: /Dismiss error/i })[0])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ── handlePay — confirmation flow ─────────────────────────────────────────────

describe('GuestBookingFlow — handlePay success', () => {
  const BOOKING_REFERENCE = 'CRK-2026-AB3CD5'

  beforeEach(() => {
    // Mock global fetch to return a successful booking response
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue({
        clientSecret: 'pi_test_secret_xyz',
        bookingReference: BOOKING_REFERENCE,
        bookingId: 'booking-uuid-test',
      }),
    } as unknown as Response /* partial stub — only .status, .ok, .json are exercised */)

    // Stripe confirmPayment resolves without error (card payment succeeds)
    stripeModule.__mockConfirmPayment.mockResolvedValue({ error: null })
    stripeModule.__mockSubmit.mockResolvedValue({ error: null })
  })

  it('shows the confirmation view after handlePay resolves successfully', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      expect(screen.getByText("You're all booked!")).toBeInTheDocument()
    })
  })

  it('sends participantName and participantAge in the booking POST body — UX-16', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(init.body) as Record<string, unknown>
    expect(body.participantName).toBe('Yuwin')
    expect(body.participantAge).toBe(10)
  })

  // UX-16: the coach-profile "Book a session" card links to checkout WITHOUT
  // participant params — the form must collect the name itself.
  describe('participant fallback field (no participant in URL)', () => {
    const NO_PARTICIPANT = { ...CHECKOUT, participantName: '', participantAge: null }

    it('does NOT render the participant field when the URL supplied a name', () => {
      render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)
      expect(screen.queryByTestId('participant-name-input')).not.toBeInTheDocument()
    })

    it('renders the participant field when the URL did not supply a name', () => {
      render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={NO_PARTICIPANT} />)
      expect(screen.getByTestId('participant-name-input')).toBeInTheDocument()
    })

    it('blocks Pay with a field error (and no API call) when the name is empty', async () => {
      const user = userEvent.setup()
      render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={NO_PARTICIPANT} />)

      await user.click(screen.getAllByTestId('pay-button')[0])

      expect(screen.getByText("Add the player's name to continue.")).toBeInTheDocument()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('sends the typed name and age in the POST body', async () => {
      const user = userEvent.setup()
      render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={NO_PARTICIPANT} />)

      await user.type(screen.getByTestId('participant-name-input'), 'Mia')
      await user.type(screen.getByTestId('participant-age-input'), '9')
      await user.click(screen.getAllByTestId('pay-button')[0])

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { body: string }]
      const body = JSON.parse(init.body) as Record<string, unknown>
      expect(body.participantName).toBe('Mia')
      expect(body.participantAge).toBe(9)
    })

    it('sends participantAge null when the age is left blank', async () => {
      const user = userEvent.setup()
      render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={NO_PARTICIPANT} />)

      await user.type(screen.getByTestId('participant-name-input'), 'Mia')
      await user.click(screen.getAllByTestId('pay-button')[0])

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { body: string }]
      const body = JSON.parse(init.body) as Record<string, unknown>
      expect(body.participantAge).toBeNull()
    })
  })

  it('confirmation shows the booking reference returned by the API', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      expect(screen.getByText(BOOKING_REFERENCE)).toBeInTheDocument()
    })
  })

  it('confirmation shows "Booking reference" label', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      expect(screen.getByText('Booking reference')).toBeInTheDocument()
    })
  })

  it('pay buttons are removed after confirmation', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument()
    })
  })

  it('form inputs are removed after confirmation', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      expect(screen.queryByLabelText(/Full name/i)).not.toBeInTheDocument()
    })
  })

  it('shows the typed email address in the confirmation message', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.type(screen.getByLabelText(/Email address/i), 'sarah@example.com')
    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      expect(screen.getByText('sarah@example.com')).toBeInTheDocument()
    })
  })

  it('shows "your email" fallback when no email is typed', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      expect(screen.getByText('your email')).toBeInTheDocument()
    })
  })

  it('copy-reference-button is present in confirmation view', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      expect(screen.getByTestId('copy-reference-button')).toBeInTheDocument()
    })
  })

  it('share-button is present in confirmation view', async () => {
    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      expect(screen.getByTestId('share-button')).toBeInTheDocument()
    })
  })
})

// ── handlePay — 409 slot_taken fetch response ─────────────────────────────────

describe('GuestBookingFlow — handlePay slot_taken from API', () => {
  beforeEach(() => {
    stripeModule.__mockSubmit.mockResolvedValue({ error: null })
    stripeModule.__mockConfirmPayment.mockResolvedValue({ error: null })
  })

  it('shows slot_taken error banner when fetch returns 409 slot_taken', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 409,
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'slot_taken' }),
    } as unknown as Response /* partial stub — only .status, .ok, .json are exercised */)

    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThanOrEqual(1)
      expect(within(alerts[0]).getByText(/just booked by someone else/i)).toBeInTheDocument()
    })
  })

  it('does NOT show confirmation view when fetch returns 409', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 409,
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'slot_taken' }),
    } as unknown as Response /* partial stub — only .status, .ok, .json are exercised */)

    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      expect(screen.queryByText("You're all booked!")).not.toBeInTheDocument()
    })
  })

  it('shows payment error banner when fetch returns a non-409 failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 500,
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'internal_error' }),
    } as unknown as Response /* partial stub — only .status, .ok, .json are exercised */)

    const user = userEvent.setup()
    render(<GuestBookingFlow coachId={COACH_ID} summary={STUB} checkout={CHECKOUT} />)

    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThanOrEqual(1)
      expect(within(alerts[0]).getByText(/Payment couldn't be completed/i)).toBeInTheDocument()
    })
  })
})
