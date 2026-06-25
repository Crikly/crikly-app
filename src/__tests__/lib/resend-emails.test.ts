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
