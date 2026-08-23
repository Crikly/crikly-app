/** @jest-environment jsdom */
// Component tests for GuestEnrolmentFlow (src/components/booking/GuestEnrolmentFlow.tsx)
//
// Mirrors the exact pattern established by GuestBookingFlow.test.tsx:
//   - Same Stripe mock shape for @stripe/react-stripe-js
//   - Same @/lib/stripe/browser mock
//   - Same next/link mock
//   - Same beforeAll browser-API stubs (navigator.clipboard, navigator.share, crypto.randomUUID)
//   - global.fetch mocked per test for POST /api/guest/programme-enrolments
//
// Business rules covered:
//   BR-01  Pay button total = sessionFeePence + platformFeePence (commission on top).
//   BR-10  Total shown as formatted GBP string (£246.40, not £224.00).
//
// New enrolment-specific scenarios:
//   - "Complete your enrolment" heading (not "Complete your booking")
//   - "You're enrolled!" confirmation (not "You're all booked!")
//   - "Enrolment reference" label (not "Booking reference")
//   - 409 spots_taken → "This programme just filled up." banner
//   - 409 invalid_sessions → "One of your selected sessions is no longer available." banner
//   - POST body shape: includes coachId, programmeId, paymentType, selectedSessionIds

import React from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BookingSummary } from '@/components/booking/BookingSummaryCard'

// ── Stripe mocks (must appear before any component import) ───────────────────
//
// Elements passes children through. useStripe / useElements return minimal stub
// objects that match what GuestEnrolmentForm calls.

jest.mock('@stripe/react-stripe-js', () => {
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

// @/lib/stripe/browser — return a resolved null promise (Stripe not loaded in jsdom)
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
import { GuestEnrolmentFlow } from '@/components/booking/GuestEnrolmentFlow'

// Pull the Stripe mock helpers (needed in handlePay tests)
import * as StripeMock from '@stripe/react-stripe-js'
const stripeModule = StripeMock as unknown as {
  __mockSubmit: jest.Mock
  __mockConfirmPayment: jest.Mock
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const COACH_ID = 'coach-uuid-001'
const PROGRAMME_ID = 'programme-uuid-001'
const ENROLMENT_REFERENCE = 'CRK-2026-ENROL1'

// BR-01: sessionFeePence = coach price, platformFeePence = commission on top
// Example: block_price = 22400p, 10% commission = 2240p → parent total = 24640p
const SUMMARY: BookingSummary = {
  coachName: 'Alex Stuart',
  sportLabel: 'Cricket',
  sessionDate: 'Summer 2026',
  sessionTime: 'Every Saturday · 9:00am – 10:00am',
  sessionType: 'Full programme (8 sessions)',
  sessionFeePence: 22400, // coach block price
  platformFeePence: 2240, // 10% commission ON TOP
}

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
  Object.defineProperty(global, 'crypto', {
    value: { randomUUID: jest.fn().mockReturnValue('test-enrol-uuid-1234') },
    configurable: true,
  })
})

afterEach(() => {
  jest.clearAllMocks()
  window.sessionStorage.clear()
})

// ── Shared interaction helpers ────────────────────────────────────────────────

/**
 * BUG-20: the pay gate requires a participant name before createEnrolment
 * fires. Fills the "Who is this for?" name field, then clicks Pay — the
 * default interaction for every test that exercises handlePay.
 */
async function clickPay(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getAllByTestId('participant-name-input')[0], 'Yuwin Test')
  await user.click(screen.getAllByTestId('pay-button')[0])
}

// ── Checkout view ──────────────────────────────────────────────────────────────

describe('GuestEnrolmentFlow — checkout view', () => {
  it('renders the "Complete your enrolment" heading (not "Complete your booking")', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )
    expect(screen.getByRole('heading', { name: /Complete your enrolment/i })).toBeInTheDocument()
  })

  it('does NOT render "Complete your booking" heading', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )
    expect(screen.queryByRole('heading', { name: /Complete your booking/i })).not.toBeInTheDocument()
  })

  it('renders Pay button with the commission-inclusive total (BR-01)', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )
    // sessionFeePence(22400) + platformFeePence(2240) = 24640p → £246.40
    const payButtons = screen.getAllByTestId('pay-button')
    expect(payButtons.length).toBeGreaterThanOrEqual(1)
    expect(payButtons[0]).toHaveTextContent(/Pay £246\.40/i)
  })

  it('renders the Stripe PaymentElement placeholder', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )
    expect(screen.getByTestId('payment-element')).toBeInTheDocument()
  })

  it('renders the full-name input', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument()
  })

  it('renders the email input', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )
    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument()
  })

  it('renders the address field with data-testid="guest-address-input"', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )
    expect(screen.getByTestId('guest-address-input')).toBeInTheDocument()
  })

  it('does NOT show the confirmation view on initial render', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )
    expect(screen.queryByText("You're enrolled!")).not.toBeInTheDocument()
  })

  it('does NOT show an error banner when no initialError is supplied', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ── spots_taken error ──────────────────────────────────────────────────────────

describe('GuestEnrolmentFlow — spots_taken error (initialError)', () => {
  it('shows an alert banner for spots_taken', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
        initialError="spots_taken"
      />,
    )
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
  })

  it('banner contains "This programme just filled up." text', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
        initialError="spots_taken"
      />,
    )
    const alert = screen.getAllByRole('alert')[0]
    expect(within(alert).getByText(/This programme just filled up\./i)).toBeInTheDocument()
  })

  it('banner has a "Back to programme" link pointing to the programme page', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
        initialError="spots_taken"
      />,
    )
    const alert = screen.getAllByRole('alert')[0]
    const link = within(alert).getByRole('link', { name: /Back to programme/i })
    expect(link).toHaveAttribute('href', `/coaches/${COACH_ID}/programmes/${PROGRAMME_ID}`)
  })

  it('clicking dismiss removes the spots_taken error banner', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
        initialError="spots_taken"
      />,
    )
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
    await user.click(screen.getAllByRole('button', { name: /Dismiss error/i })[0])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ── invalid_sessions error ─────────────────────────────────────────────────────

describe('GuestEnrolmentFlow — invalid_sessions error (initialError)', () => {
  it('shows an alert banner for invalid_sessions', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={['session-uuid-001']}
        summary={SUMMARY}
        initialError="invalid_sessions"
      />,
    )
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
  })

  it('banner contains "One of your selected sessions is no longer available." text', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={['session-uuid-001']}
        summary={SUMMARY}
        initialError="invalid_sessions"
      />,
    )
    const alert = screen.getAllByRole('alert')[0]
    expect(
      within(alert).getByText(/One of your selected sessions is no longer available\./i),
    ).toBeInTheDocument()
  })

  it('invalid_sessions banner has a "Choose your sessions again" link', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={['session-uuid-001']}
        summary={SUMMARY}
        initialError="invalid_sessions"
      />,
    )
    const alert = screen.getAllByRole('alert')[0]
    const link = within(alert).getByRole('link', { name: /Choose your sessions again/i })
    expect(link).toHaveAttribute('href', `/coaches/${COACH_ID}/programmes/${PROGRAMME_ID}`)
  })

  it('invalid_sessions banner does NOT show "This programme just filled up."', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={['session-uuid-001']}
        summary={SUMMARY}
        initialError="invalid_sessions"
      />,
    )
    const alert = screen.getAllByRole('alert')[0]
    expect(within(alert).queryByText(/just filled up/i)).not.toBeInTheDocument()
  })
})

// ── payment error ──────────────────────────────────────────────────────────────

describe('GuestEnrolmentFlow — payment error (initialError)', () => {
  it('shows a payment failure alert', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
        initialError="payment"
      />,
    )
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1)
  })

  it('payment banner contains "Payment couldn\'t be completed" message', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
        initialError="payment"
      />,
    )
    const alert = screen.getAllByRole('alert')[0]
    expect(within(alert).getByText(/Payment couldn't be completed/i)).toBeInTheDocument()
  })
})

// ── handlePay — confirmation flow ─────────────────────────────────────────────

describe('GuestEnrolmentFlow — handlePay success (confirmation view)', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue({
        clientSecret: 'pi_test_enrol_secret',
        enrolmentReference: ENROLMENT_REFERENCE,
        enrolmentId: 'enrolment-uuid-001',
      }),
    } as unknown as Response)

    stripeModule.__mockConfirmPayment.mockResolvedValue({ error: null })
    stripeModule.__mockSubmit.mockResolvedValue({ error: null })
  })

  it('shows "You\'re enrolled!" after handlePay resolves successfully', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(screen.getByText("You're enrolled!")).toBeInTheDocument()
    })
  })

  it('does NOT show "You\'re all booked!" (enrolment-specific copy)', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      // "You're enrolled!" must be visible
      expect(screen.getByText("You're enrolled!")).toBeInTheDocument()
    })
    expect(screen.queryByText("You're all booked!")).not.toBeInTheDocument()
  })

  it('shows "Enrolment reference" label (not "Booking reference")', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(screen.getByText(/Enrolment reference/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Booking reference/i)).not.toBeInTheDocument()
  })

  it('shows the enrolment reference returned by the API', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(screen.getByText(ENROLMENT_REFERENCE)).toBeInTheDocument()
    })
  })

  it('pay buttons are removed after confirmation', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument()
    })
  })

  it('form inputs are removed after confirmation', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(screen.queryByLabelText(/Full name/i)).not.toBeInTheDocument()
    })
  })

  it('shows the typed email address in the confirmation message', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await user.type(screen.getByLabelText(/Email address/i), 'sarah@example.com')
    await clickPay(user)

    await waitFor(() => {
      expect(screen.getByText('sarah@example.com')).toBeInTheDocument()
    })
  })

  it('shows "your email" fallback when no email is typed', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(screen.getByText('your email')).toBeInTheDocument()
    })
  })

  it('copy-reference-button is present in confirmation view', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(screen.getByTestId('copy-reference-button')).toBeInTheDocument()
    })
  })

  it('share-button is present in confirmation view', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(screen.getByTestId('share-button')).toBeInTheDocument()
    })
  })
})

// ── handlePay — POST body shape ────────────────────────────────────────────────

describe('GuestEnrolmentFlow — handlePay POST body shape', () => {
  const SESSION_IDS = ['session-uuid-001', 'session-uuid-002']

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue({
        clientSecret: 'pi_test_secret',
        enrolmentReference: ENROLMENT_REFERENCE,
        enrolmentId: 'enrolment-uuid-001',
      }),
    } as unknown as Response)

    stripeModule.__mockConfirmPayment.mockResolvedValue({ error: null })
    stripeModule.__mockSubmit.mockResolvedValue({ error: null })
  })

  it('POSTs to /api/guest/programme-enrolments', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/guest/programme-enrolments',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('POST body includes coachId', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body.coachId).toBe(COACH_ID)
    })
  })

  it('POST body includes programmeId', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body.programmeId).toBe(PROGRAMME_ID)
    })
  })

  it('POST body includes paymentType', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body.paymentType).toBe('per_session')
    })
  })

  it('POST body includes selectedSessionIds array', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(Array.isArray(body.selectedSessionIds)).toBe(true)
      expect(body.selectedSessionIds).toEqual(SESSION_IDS)
    })
  })

  it('POST body includes idempotencyToken', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(typeof body.idempotencyToken).toBe('string')
      expect(body.idempotencyToken).toBe('test-enrol-uuid-1234')
    })
  })

  it('POST body includes guest object with fullName, email, phone, address, townCity, postcode', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
      />,
    )

    // Fill in the form
    await user.type(screen.getByLabelText(/Full name/i), 'Sarah Test')
    await user.type(screen.getByLabelText(/Email address/i), 'sarah@example.com')
    await clickPay(user)

    await waitFor(() => {
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      const guest = body.guest as Record<string, string>
      expect(guest.fullName).toBe('Sarah Test')
      expect(guest.email).toBe('sarah@example.com')
    })
  })
})

// ── handlePay — 409 spots_taken from API ──────────────────────────────────────

describe('GuestEnrolmentFlow — handlePay 409 spots_taken from API', () => {
  beforeEach(() => {
    stripeModule.__mockSubmit.mockResolvedValue({ error: null })
    stripeModule.__mockConfirmPayment.mockResolvedValue({ error: null })
  })

  it('shows spots_taken error banner when fetch returns 409 spots_taken', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 409,
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'spots_taken' }),
    } as unknown as Response)

    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThanOrEqual(1)
      expect(within(alerts[0]).getByText(/This programme just filled up\./i)).toBeInTheDocument()
    })
  })

  it('does NOT show confirmation view when fetch returns 409 spots_taken', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 409,
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'spots_taken' }),
    } as unknown as Response)

    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(screen.queryByText("You're enrolled!")).not.toBeInTheDocument()
    })
  })
})

// ── handlePay — 409 invalid_sessions from API ─────────────────────────────────

describe('GuestEnrolmentFlow — handlePay 409 invalid_sessions from API', () => {
  beforeEach(() => {
    stripeModule.__mockSubmit.mockResolvedValue({ error: null })
    stripeModule.__mockConfirmPayment.mockResolvedValue({ error: null })
  })

  it('shows invalid_sessions error banner when fetch returns 409 invalid_sessions', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 409,
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'invalid_sessions' }),
    } as unknown as Response)

    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={['session-uuid-001']}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThanOrEqual(1)
      expect(
        within(alerts[0]).getByText(/One of your selected sessions is no longer available\./i),
      ).toBeInTheDocument()
    })
  })

  it('shows payment error banner when fetch returns a non-409 failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 500,
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'internal_error' }),
    } as unknown as Response)

    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={['session-uuid-001']}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThanOrEqual(1)
      expect(within(alerts[0]).getByText(/Payment couldn't be completed/i)).toBeInTheDocument()
    })
  })
})

// ── Participant capture (BUG-20 / BUG-24) ─────────────────────────────────────
//
// The enrol checkout owns the "Who is this for?" fields: required name gates
// handlePay, values land in the POST body, and the availability panel's
// sessionStorage handoff (BUG-24) pre-fills them — never URL params.

describe('GuestEnrolmentFlow — participant capture (BUG-20/BUG-24)', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue({
        clientSecret: 'pi_test_secret',
        enrolmentReference: ENROLMENT_REFERENCE,
        enrolmentId: 'enrolment-uuid-001',
      }),
    } as unknown as Response)

    stripeModule.__mockConfirmPayment.mockResolvedValue({ error: null })
    stripeModule.__mockSubmit.mockResolvedValue({ error: null })
  })

  it('blocks Pay and shows the inline error when the participant name is empty', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await user.click(screen.getAllByTestId('pay-button')[0])

    expect(screen.getByTestId('participant-error')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('POST body carries participantName and the parsed participantAge', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await user.type(screen.getAllByTestId('participant-name-input')[0], 'Yuwin Test')
    await user.type(screen.getAllByTestId('participant-age-input')[0], '9')
    await user.click(screen.getAllByTestId('pay-button')[0])

    await waitFor(() => {
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body.participantName).toBe('Yuwin Test')
      expect(body.participantAge).toBe(9)
    })
  })

  it('sends participantAge: null when the age field is left empty', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body.participantAge).toBeNull()
    })
  })

  it('pre-fills from the availability panel sessionStorage handoff (BUG-24)', async () => {
    window.sessionStorage.setItem(
      'crikly:enrol-participant',
      JSON.stringify({ name: 'Handoff Kid', age: '11' }),
    )

    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('participant-name-input')[0]).toHaveValue('Handoff Kid')
      expect(screen.getAllByTestId('participant-age-input')[0]).toHaveValue(11)
    })
  })

  it('a malformed handoff is ignored (fields stay empty, no crash)', async () => {
    window.sessionStorage.setItem('crikly:enrol-participant', 'not-json{')

    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="block_upfront"
        selectedSessionIds={[]}
        summary={SUMMARY}
      />,
    )

    expect(screen.getAllByTestId('participant-name-input')[0]).toHaveValue('')
  })
})

// ── slot_full copy (BUG-23) ───────────────────────────────────────────────────
//
// A camp (session, slot) that fills in the race window returns 409 slot_full
// BEFORE any charge — the banner must say so, never the "check your card
// details" payment copy.

describe('GuestEnrolmentFlow — 409 slot_full (BUG-23)', () => {
  it('shows the slot-filled copy (not payment copy) on 409 slot_full', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 409,
      ok: false,
      json: jest.fn().mockResolvedValue({
        error: 'slot_full',
        full: [{ sessionId: '11111111-1111-4111-8111-111111111101', slotIndex: 0 }],
      }),
    } as unknown as Response)
    stripeModule.__mockSubmit.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={['11111111-1111-4111-8111-111111111101']}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(within(alerts[0]).getByText(/just filled up/i)).toBeInTheDocument()
      expect(within(alerts[0]).getByText(/haven't been charged/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/check your card details/i)).not.toBeInTheDocument()
  })
})

// ── BUG-79: signed-in parent (authedCheckout) ─────────────────────────────────

describe('GuestEnrolmentFlow — BUG-79 authed parent checkout', () => {
  const AUTHED = {
    fullName: 'Pat Parent',
    email: 'parent@example.com',
    phone: '07700 900000',
    townCity: 'London',
    postcode: 'SW1A 1AA',
  }
  const SESSION_IDS = ['session-uuid-001', 'session-uuid-002']

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue({
        clientSecret: 'pi_test_secret',
        enrolmentReference: ENROLMENT_REFERENCE,
        enrolmentId: 'enrolment-uuid-001',
      }),
    } as unknown as Response)
    stripeModule.__mockConfirmPayment.mockResolvedValue({ error: null })
    stripeModule.__mockSubmit.mockResolvedValue({ error: null })
  })

  it('pre-fills contact fields from the account', () => {
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
        authedCheckout={AUTHED}
      />,
    )
    expect(screen.getByDisplayValue('Pat Parent')).toBeInTheDocument()
    expect(screen.getByDisplayValue('parent@example.com')).toBeInTheDocument()
  })

  it('POSTs to /api/parent/programme-enrolments WITHOUT a guest block', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
        authedCheckout={AUTHED}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/parent/programme-enrolments',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.guest).toBeUndefined()
    expect(body).toEqual(
      expect.objectContaining({
        coachId: COACH_ID,
        programmeId: PROGRAMME_ID,
        paymentType: 'per_session',
        selectedSessionIds: SESSION_IDS,
        participantName: 'Yuwin Test',
        idempotencyToken: 'test-enrol-uuid-1234',
      }),
    )
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/guest/programme-enrolments',
      expect.anything(),
    )
  })

  it('guest (no authedCheckout) still POSTs to the guest route — regression guard', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
        authedCheckout={null}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/guest/programme-enrolments',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.guest).toBeDefined()
  })

  it('confirmation shows "View your bookings" instead of "Create account" for a parent', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
        authedCheckout={AUTHED}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(screen.getByText("You're enrolled!")).toBeInTheDocument()
    })
    expect(screen.getByTestId('view-bookings-link')).toHaveAttribute('href', '/parent/bookings')
    expect(screen.queryByText('Create account')).not.toBeInTheDocument()
  })

  it('guest confirmation still shows the "Create account" nudge', async () => {
    const user = userEvent.setup()
    render(
      <GuestEnrolmentFlow
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        paymentType="per_session"
        selectedSessionIds={SESSION_IDS}
        summary={SUMMARY}
      />,
    )

    await clickPay(user)

    await waitFor(() => {
      expect(screen.getByText("You're enrolled!")).toBeInTheDocument()
    })
    expect(screen.getByText('Create account')).toBeInTheDocument()
    expect(screen.queryByTestId('view-bookings-link')).not.toBeInTheDocument()
  })
})
