import { bookingIcsFilename, buildBookingIcs } from '@/lib/calendar/ics'
import type { BookingIcsParams } from '@/lib/calendar/ics'

// P-14 / CF-NOTIFY-03 — the .ics builder shared by the bookings page
// download and the webhook confirmation-email attachment.

function makeParams(overrides: Partial<BookingIcsParams> = {}): BookingIcsParams {
  return {
    bookingId: 'b1f8e2a0-0000-0000-0000-000000000001',
    bookingReference: 'CRK-2026-ABCD',
    sportName: 'Cricket',
    coachName: 'Ravi Patel',
    sessionDate: '2026-08-27',
    startTime: '10:00:00',
    endTime: '11:00:00',
    venue: 'The Oval Cricket Centre, Kennington',
    nowMs: Date.UTC(2026, 7, 20, 12, 0, 0),
    ...overrides,
  }
}

describe('buildBookingIcs', () => {
  it('emits a complete VCALENDAR/VEVENT with CRLF line endings', () => {
    const ics = buildBookingIcs(makeParams())
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VEVENT')
    expect(ics).toContain('UID:b1f8e2a0-0000-0000-0000-000000000001@crikly.app')
    // No bare LF lines — every line break is CRLF.
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('converts BST wall-clock session times to true UTC instants', () => {
    // 27 Aug 2026 is BST: 10:00 London = 09:00Z.
    const ics = buildBookingIcs(makeParams())
    expect(ics).toContain('DTSTART:20260827T090000Z')
    expect(ics).toContain('DTEND:20260827T100000Z')
  })

  it('keeps GMT winter times equal to UTC', () => {
    const ics = buildBookingIcs(
      makeParams({ sessionDate: '2026-01-15', startTime: '10:00:00', endTime: '11:00:00' }),
    )
    expect(ics).toContain('DTSTART:20260115T100000Z')
    expect(ics).toContain('DTEND:20260115T110000Z')
  })

  it('carries title, venue and booking reference', () => {
    const ics = buildBookingIcs(makeParams())
    expect(ics).toContain('SUMMARY:Cricket session with Ravi Patel')
    // Comma is escaped per RFC 5545 TEXT rules.
    expect(ics).toContain('LOCATION:The Oval Cricket Centre\\, Kennington')
    expect(ics).toContain('Booking reference: CRK-2026-ABCD')
  })

  it('omits LOCATION when the venue is unknown', () => {
    const ics = buildBookingIcs(makeParams({ venue: null }))
    expect(ics).not.toContain('LOCATION:')
  })

  it('escapes RFC 5545 special characters in text fields', () => {
    const ics = buildBookingIcs(
      makeParams({ coachName: 'A; B, C\\D', venue: 'Hall 1; Court 2' }),
    )
    expect(ics).toContain('A\\; B\\, C\\\\D')
    expect(ics).toContain('LOCATION:Hall 1\\; Court 2')
  })

  it('folds lines longer than 75 characters with CRLF + space', () => {
    const longVenue = 'V'.repeat(120)
    const ics = buildBookingIcs(makeParams({ venue: longVenue }))
    const folded = ics.split('\r\n').filter((line) => line.startsWith(' '))
    expect(folded.length).toBeGreaterThan(0)
    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75)
    }
  })

  it('stamps DTSTAMP from the injected nowMs', () => {
    const ics = buildBookingIcs(makeParams())
    expect(ics).toContain('DTSTAMP:20260820T120000Z')
  })
})

describe('bookingIcsFilename', () => {
  it('builds a safe reference-based filename', () => {
    expect(bookingIcsFilename('CRK-2026-ABCD')).toBe('crikly-CRK-2026-ABCD.ics')
    expect(bookingIcsFilename('CRK/2026 ABCD')).toBe('crikly-CRK2026ABCD.ics')
  })
})
