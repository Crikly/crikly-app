// Unit tests for sendGuestBookingConfirmation (src/lib/resend/emails.ts)
//
// P-00c-EMAIL coverage:
//   - Resend is called with correct from, to, and subject (containing booking reference)
//   - HTML contains the hosted logo img with alt="Crikly"
//   - Escaped guest/coach names appear in the HTML — XSS strings are neutralised
//   - Amount is formatted correctly from pence (e.g. 6600 → "£66.00")
//   - No CTA anchor/button to a coach profile or dashboard appears in the HTML
//   - Throws when Resend returns an error object

// ── Module mocks (must appear before any imports) ─────────────────────────────

const mockEmailsSend = jest.fn()

jest.mock('@/lib/resend/client', () => ({
  getResend: jest.fn(() => ({
    emails: {
      send: mockEmailsSend,
    },
  })),
}))

import { sendGuestBookingConfirmation } from '@/lib/resend/emails'
import type { GuestBookingConfirmationParams } from '@/lib/resend/emails'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_PARAMS: GuestBookingConfirmationParams = {
  guestName: 'Sarah Test',
  guestEmail: 'sarah@example.com',
  coachName: 'Coach Davies',
  bookingReference: 'CRK-2026-ABC123',
  sessionDate: 'Tuesday, 15 July 2026',
  sessionTime: '10:00am – 11:00am',
  sessionType: 'individual',
  totalPence: 6600,
}

// ── Setup ─────────────────────────────────────────────────────────────────────

process.env.RESEND_API_KEY = 'test-resend-key'

beforeEach(() => {
  jest.clearAllMocks()
  mockEmailsSend.mockResolvedValue({ data: { id: 'email-id-test' }, error: null })
})

// ── from / to / subject ───────────────────────────────────────────────────────

describe('sendGuestBookingConfirmation — from/to/subject', () => {
  it('calls Resend with from address Crikly <bookings@crikly.app>', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)

    const [callArg] = mockEmailsSend.mock.calls[0] as [Record<string, unknown>]
    expect(callArg.from).toBe('Crikly <bookings@crikly.app>')
  })

  it('calls Resend with the guest email as the to address', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)

    const [callArg] = mockEmailsSend.mock.calls[0] as [Record<string, unknown>]
    expect(callArg.to).toBe('sarah@example.com')
  })

  it('subject contains the booking reference', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)

    const [callArg] = mockEmailsSend.mock.calls[0] as [Record<string, unknown>]
    const subject = callArg.subject as string
    expect(subject).toContain('CRK-2026-ABC123')
  })

  it('subject matches the expected pattern', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)

    const [callArg] = mockEmailsSend.mock.calls[0] as [Record<string, unknown>]
    expect(callArg.subject).toBe(
      'Your Crikly booking is confirmed — CRK-2026-ABC123',
    )
  })
})

// ── HTML content ──────────────────────────────────────────────────────────────

describe('sendGuestBookingConfirmation — HTML content', () => {
  function getHtml(): string {
    const [callArg] = mockEmailsSend.mock.calls[0] as [Record<string, unknown>]
    return callArg.html as string
  }

  it('HTML contains the logo img with alt="Crikly"', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)
    expect(getHtml()).toContain('alt="Crikly"')
  })

  it('HTML contains the hosted logo URL https://crikly.app/logo.png', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)
    expect(getHtml()).toContain('https://crikly.app/logo.png')
  })

  it('HTML contains the guest name', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)
    expect(getHtml()).toContain('Sarah Test')
  })

  it('HTML contains the coach name', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)
    expect(getHtml()).toContain('Coach Davies')
  })

  it('HTML contains the booking reference', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)
    expect(getHtml()).toContain('CRK-2026-ABC123')
  })

  it('amount is formatted as £66.00 from 6600 pence', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)
    expect(getHtml()).toContain('£66.00')
  })

  it('formats 1050 pence as £10.50', async () => {
    mockEmailsSend.mockResolvedValue({ data: { id: 'x' }, error: null })
    await sendGuestBookingConfirmation({ ...BASE_PARAMS, totalPence: 1050 })
    expect(getHtml()).toContain('£10.50')
  })

  it('does NOT contain a CTA anchor to a coach profile URL', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)
    const html = getHtml()
    // Guest emails must not include links to coach-profile or dashboard pages
    expect(html).not.toMatch(/href="[^"]*\/coach\//)
    expect(html).not.toMatch(/href="[^"]*\/dashboard/)
    expect(html).not.toMatch(/View coach profile/i)
    expect(html).not.toMatch(/View in dashboard/i)
  })

  // UX-16: the email must say who the session is for, not just who paid.
  it('shows a "Booking for" row with name and age when both are given', async () => {
    await sendGuestBookingConfirmation({
      ...BASE_PARAMS,
      participantName: 'Yuwin',
      participantAge: 10,
    })
    const html = getHtml()
    expect(html).toContain('Booking for')
    expect(html).toContain('Yuwin (age 10)')
  })

  it('shows the "Booking for" row with name only when no age was given', async () => {
    await sendGuestBookingConfirmation({ ...BASE_PARAMS, participantName: 'Yuwin' })
    const html = getHtml()
    expect(html).toContain('Booking for')
    expect(html).toContain('Yuwin')
    expect(html).not.toContain('(age')
  })

  it('omits the "Booking for" row for pre-UX-16 sends without a participant', async () => {
    await sendGuestBookingConfirmation(BASE_PARAMS)
    expect(getHtml()).not.toContain('Booking for')
  })

  it('escapes < > characters in participant name', async () => {
    await sendGuestBookingConfirmation({
      ...BASE_PARAMS,
      participantName: '<script>alert(1)</script>',
    })
    const html = getHtml()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

// ── XSS escaping ──────────────────────────────────────────────────────────────

describe('sendGuestBookingConfirmation — XSS escaping', () => {
  function getHtml(): string {
    const [callArg] = mockEmailsSend.mock.calls[0] as [Record<string, unknown>]
    return callArg.html as string
  }

  it('escapes < > characters in guest name', async () => {
    await sendGuestBookingConfirmation({ ...BASE_PARAMS, guestName: '<script>alert(1)</script>' })
    const html = getHtml()
    // Raw script tags must NOT appear in the HTML
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('</script>')
    // Escaped equivalents must be present
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes < > characters in coach name', async () => {
    await sendGuestBookingConfirmation({ ...BASE_PARAMS, coachName: '<img src=x onerror=alert(1)>' })
    const html = getHtml()
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })

  it('escapes double-quote characters in guest name', async () => {
    await sendGuestBookingConfirmation({ ...BASE_PARAMS, guestName: 'O"Brien' })
    const html = getHtml()
    // Raw unescaped quote in a name should be escaped
    expect(html).toContain('O&quot;Brien')
  })

  it('escapes ampersand in coach name', async () => {
    await sendGuestBookingConfirmation({ ...BASE_PARAMS, coachName: 'Smith & Sons' })
    const html = getHtml()
    expect(html).toContain('Smith &amp; Sons')
    expect(html).not.toContain('Smith & Sons')
  })
})

// ── Return value and error handling ───────────────────────────────────────────

describe('sendGuestBookingConfirmation — return value and errors', () => {
  it('returns { success: true } on successful send', async () => {
    const result = await sendGuestBookingConfirmation(BASE_PARAMS)
    expect(result).toEqual({ success: true })
  })

  it('throws when Resend returns a non-null error object', async () => {
    mockEmailsSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key', name: 'validation_error' },
    })

    await expect(sendGuestBookingConfirmation(BASE_PARAMS)).rejects.toThrow(
      /Resend error/,
    )
  })

  it('throws with a message containing the Resend error message', async () => {
    mockEmailsSend.mockResolvedValue({
      data: null,
      error: { message: 'Domain not verified', name: 'validation_error' },
    })

    await expect(sendGuestBookingConfirmation(BASE_PARAMS)).rejects.toThrow(
      'Domain not verified',
    )
  })

  it('throws when Resend.emails.send itself throws (network error)', async () => {
    mockEmailsSend.mockRejectedValue(new Error('Network timeout'))

    await expect(sendGuestBookingConfirmation(BASE_PARAMS)).rejects.toThrow(
      'Network timeout',
    )
  })
})

// ── Programme confirmation — participant (BUG-20) ─────────────────────────────
//
// Mirrors the sendGuestBookingConfirmation "Booking for" coverage above: same
// row treatment, same escaping, same omission for pre-BUG-20 sends.

import { sendGuestProgrammeConfirmation } from '@/lib/resend/emails'
import type { GuestProgrammeConfirmationParams } from '@/lib/resend/emails'

const BASE_PROGRAMME_PARAMS: GuestProgrammeConfirmationParams = {
  guestName: 'Sarah Test',
  guestEmail: 'sarah@example.com',
  coachName: 'Coach Davies',
  enrolmentReference: 'CRK-2026-ENROL1',
  programmeTitle: 'Summer Camp',
  scheduleSummary: 'Mon–Fri · 9:00am – 12:00pm',
  sessionsSummary: '3 sessions',
  totalPence: 18480,
}

describe('sendGuestProgrammeConfirmation — participant (BUG-20)', () => {
  function getHtml(): string {
    const [callArg] = mockEmailsSend.mock.calls[0] as [Record<string, unknown>]
    return callArg.html as string
  }

  it('shows a "Booking for" row with name and age when both are given', async () => {
    await sendGuestProgrammeConfirmation({
      ...BASE_PROGRAMME_PARAMS,
      participantName: 'Yuwin',
      participantAge: 10,
    })
    const html = getHtml()
    expect(html).toContain('Booking for')
    expect(html).toContain('Yuwin (age 10)')
  })

  it('shows the "Booking for" row with name only when no age was given', async () => {
    await sendGuestProgrammeConfirmation({ ...BASE_PROGRAMME_PARAMS, participantName: 'Yuwin' })
    const html = getHtml()
    expect(html).toContain('Booking for')
    expect(html).toContain('Yuwin')
    expect(html).not.toContain('(age')
  })

  it('omits the "Booking for" row for pre-BUG-20 sends without a participant', async () => {
    await sendGuestProgrammeConfirmation(BASE_PROGRAMME_PARAMS)
    expect(getHtml()).not.toContain('Booking for')
  })

  it('renders BUG-23 camp session lines under the Sessions row, individually escaped', async () => {
    await sendGuestProgrammeConfirmation({
      ...BASE_PROGRAMME_PARAMS,
      sessionLines: [
        'Tue 4 Aug — Morning (9:00am – 12:00pm)',
        'Tue 4 Aug — Afternoon (1:00pm – 5:00pm)',
      ],
    })
    const html = getHtml()
    expect(html).toContain('Morning (9:00am')
    expect(html).toContain('Afternoon (1:00pm')
  })

  it('omits session lines for non-camp sends (count-only Sessions row unchanged)', async () => {
    await sendGuestProgrammeConfirmation(BASE_PROGRAMME_PARAMS)
    expect(getHtml()).not.toContain('Morning (')
  })

  it('escapes < > characters in the participant name', async () => {
    await sendGuestProgrammeConfirmation({
      ...BASE_PROGRAMME_PARAMS,
      participantName: '<script>alert(1)</script>',
    })
    const html = getHtml()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

// ── CF-NOTIFY-02: sendNewBookingToCoach ───────────────────────────────────────

import { sendNewBookingToCoach } from '@/lib/resend/emails'
import type { NewBookingToCoachParams } from '@/lib/resend/emails'

const BASE_COACH_PARAMS: NewBookingToCoachParams = {
  coachEmail: 'coach@example.com',
  coachName: 'Coach Davies',
  parentName: 'Sarah Test',
  sport: 'Cricket',
  sessionDate: 'Saturday, 15 August 2026',
  sessionTime: '2:00pm – 3:00pm',
  coachPricePence: 4000,
  bookingReference: 'CRK-2026-ABC123',
  dashboardUrl: 'https://crikly.app/coach/bookings/booking-uuid-001',
}

describe('sendNewBookingToCoach — from/to/subject', () => {
  it('calls Resend with the coach email as the to address', async () => {
    await sendNewBookingToCoach(BASE_COACH_PARAMS)

    const [callArg] = mockEmailsSend.mock.calls[0] as [Record<string, unknown>]
    expect(callArg.to).toBe('coach@example.com')
  })

  it('subject contains the parent name and session date', async () => {
    await sendNewBookingToCoach(BASE_COACH_PARAMS)

    const [callArg] = mockEmailsSend.mock.calls[0] as [Record<string, unknown>]
    expect(callArg.subject).toBe('New booking from Sarah Test — Saturday, 15 August 2026')
  })

  it('strips CR/LF from the parent name in the subject (header-injection guard)', async () => {
    await sendNewBookingToCoach({
      ...BASE_COACH_PARAMS,
      parentName: 'Sarah\r\nBcc: victim@example.com',
    })

    const [callArg] = mockEmailsSend.mock.calls[0] as [Record<string, unknown>]
    const subject = callArg.subject as string
    expect(subject).not.toContain('\r')
    expect(subject).not.toContain('\n')
    expect(subject).toContain('Sarah Bcc: victim@example.com')
  })
})

describe('sendNewBookingToCoach — HTML content', () => {
  function getHtml(): string {
    const [callArg] = mockEmailsSend.mock.calls[0] as [Record<string, unknown>]
    return callArg.html as string
  }

  it('BR-01: renders the coach payout from coachPricePence (4000 → £40.00)', async () => {
    await sendNewBookingToCoach(BASE_COACH_PARAMS)
    expect(getHtml()).toContain('£40.00')
  })

  it('renders the dashboard CTA link', async () => {
    await sendNewBookingToCoach(BASE_COACH_PARAMS)
    expect(getHtml()).toContain('https://crikly.app/coach/bookings/booking-uuid-001')
  })

  it('renders the booking reference', async () => {
    await sendNewBookingToCoach(BASE_COACH_PARAMS)
    expect(getHtml()).toContain('CRK-2026-ABC123')
  })

  it('escapes < > characters in the parent name (guest-form input)', async () => {
    await sendNewBookingToCoach({
      ...BASE_COACH_PARAMS,
      parentName: '<script>alert(1)</script>',
    })
    const html = getHtml()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes < > characters in the coach name', async () => {
    await sendNewBookingToCoach({
      ...BASE_COACH_PARAMS,
      coachName: '<img src=x onerror=alert(1)>',
    })
    const html = getHtml()
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })
})

describe('sendNewBookingToCoach — error handling', () => {
  it('throws when Resend returns an error object', async () => {
    mockEmailsSend.mockResolvedValue({ data: null, error: { message: 'Invalid API key' } })

    await expect(sendNewBookingToCoach(BASE_COACH_PARAMS)).rejects.toThrow(
      '[sendNewBookingToCoach] Resend error: Invalid API key',
    )
  })
})
