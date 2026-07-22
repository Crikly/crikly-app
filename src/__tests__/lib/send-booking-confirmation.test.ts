// Unit tests for sendBookingConfirmation (src/lib/resend/send-booking-confirmation.ts)
//
// P-00c-EMAIL coverage:
//   - Returns true when sendGuestBookingConfirmation resolves successfully
//   - Returns false (never throws) when sendGuestBookingConfirmation throws
//   - Console.error is called on failure (not suppressed silently)

// ── Module mocks (must appear before any imports) ─────────────────────────────

const mockSendGuestBookingConfirmation = jest.fn()

jest.mock('@/lib/resend/emails', () => ({
  sendGuestBookingConfirmation: mockSendGuestBookingConfirmation,
}))

import { sendBookingConfirmation } from '@/lib/resend/send-booking-confirmation'
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

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Success path ──────────────────────────────────────────────────────────────

describe('sendBookingConfirmation — success path', () => {
  it('returns true when sendGuestBookingConfirmation resolves', async () => {
    mockSendGuestBookingConfirmation.mockResolvedValue({ success: true })

    const result = await sendBookingConfirmation(BASE_PARAMS)

    expect(result).toBe(true)
  })

  it('forwards all params to sendGuestBookingConfirmation', async () => {
    mockSendGuestBookingConfirmation.mockResolvedValue({ success: true })

    await sendBookingConfirmation(BASE_PARAMS)

    expect(mockSendGuestBookingConfirmation).toHaveBeenCalledTimes(1)
    expect(mockSendGuestBookingConfirmation).toHaveBeenCalledWith(BASE_PARAMS)
  })
})

// ── Failure path — never throws ───────────────────────────────────────────────

describe('sendBookingConfirmation — failure path (never throws)', () => {
  it('returns false when sendGuestBookingConfirmation throws', async () => {
    mockSendGuestBookingConfirmation.mockRejectedValue(new Error('Resend error: Invalid API key'))

    const result = await sendBookingConfirmation(BASE_PARAMS)

    expect(result).toBe(false)
  })

  it('does NOT throw when sendGuestBookingConfirmation throws', async () => {
    mockSendGuestBookingConfirmation.mockRejectedValue(new Error('Network timeout'))

    await expect(sendBookingConfirmation(BASE_PARAMS)).resolves.toBe(false)
  })

  it('calls console.error on failure', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockSendGuestBookingConfirmation.mockRejectedValue(new Error('Domain not verified'))

    await sendBookingConfirmation(BASE_PARAMS)

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })

  it('console.error message references the booking reference', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockSendGuestBookingConfirmation.mockRejectedValue(new Error('Resend failed'))

    await sendBookingConfirmation({ ...BASE_PARAMS, bookingReference: 'CRK-2026-XYZ999' })

    const [errorMessage] = consoleSpy.mock.calls[0] as [string]
    expect(errorMessage).toContain('CRK-2026-XYZ999')

    consoleSpy.mockRestore()
  })

  it('returns false for non-Error rejections (e.g. string throws)', async () => {
    mockSendGuestBookingConfirmation.mockRejectedValue('unexpected string error')

    const result = await sendBookingConfirmation(BASE_PARAMS)

    expect(result).toBe(false)
  })
})
