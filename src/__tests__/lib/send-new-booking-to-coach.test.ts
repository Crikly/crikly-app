// Unit tests for sendNewBookingNotification (src/lib/resend/send-new-booking-to-coach.ts)
//
// CF-NOTIFY-02 coverage (mirrors send-booking-confirmation.test.ts):
//   - Returns true when sendNewBookingToCoach resolves successfully
//   - Returns false (never throws) when sendNewBookingToCoach throws
//   - Console.error is called on failure (not suppressed silently)

// ── Module mocks (must appear before any imports) ─────────────────────────────

const mockSendNewBookingToCoach = jest.fn()

jest.mock('@/lib/resend/emails', () => ({
  sendNewBookingToCoach: mockSendNewBookingToCoach,
}))

import { sendNewBookingNotification } from '@/lib/resend/send-new-booking-to-coach'
import type { NewBookingToCoachParams } from '@/lib/resend/emails'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_PARAMS: NewBookingToCoachParams = {
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

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Success path ──────────────────────────────────────────────────────────────

describe('sendNewBookingNotification — success path', () => {
  it('returns true when sendNewBookingToCoach resolves', async () => {
    mockSendNewBookingToCoach.mockResolvedValue({ success: true })

    const result = await sendNewBookingNotification(BASE_PARAMS)

    expect(result).toBe(true)
  })

  it('forwards all params to sendNewBookingToCoach', async () => {
    mockSendNewBookingToCoach.mockResolvedValue({ success: true })

    await sendNewBookingNotification(BASE_PARAMS)

    expect(mockSendNewBookingToCoach).toHaveBeenCalledTimes(1)
    expect(mockSendNewBookingToCoach).toHaveBeenCalledWith(BASE_PARAMS)
  })
})

// ── Failure path — never throws ───────────────────────────────────────────────

describe('sendNewBookingNotification — failure path (never throws)', () => {
  it('returns false when sendNewBookingToCoach throws', async () => {
    mockSendNewBookingToCoach.mockRejectedValue(new Error('Resend error: Invalid API key'))

    const result = await sendNewBookingNotification(BASE_PARAMS)

    expect(result).toBe(false)
  })

  it('does NOT throw when sendNewBookingToCoach throws', async () => {
    mockSendNewBookingToCoach.mockRejectedValue(new Error('Network timeout'))

    await expect(sendNewBookingNotification(BASE_PARAMS)).resolves.toBe(false)
  })

  it('calls console.error on failure', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockSendNewBookingToCoach.mockRejectedValue(new Error('Domain not verified'))

    await sendNewBookingNotification(BASE_PARAMS)

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })

  it('console.error message references the booking reference', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockSendNewBookingToCoach.mockRejectedValue(new Error('Resend failed'))

    await sendNewBookingNotification({ ...BASE_PARAMS, bookingReference: 'CRK-2026-XYZ999' })

    const [errorMessage] = consoleSpy.mock.calls[0] as [string]
    expect(errorMessage).toContain('CRK-2026-XYZ999')

    consoleSpy.mockRestore()
  })

  it('returns false for non-Error rejections (e.g. string throws)', async () => {
    mockSendNewBookingToCoach.mockRejectedValue('unexpected string error')

    const result = await sendNewBookingNotification(BASE_PARAMS)

    expect(result).toBe(false)
  })
})
