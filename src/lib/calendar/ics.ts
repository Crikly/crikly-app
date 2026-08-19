// P-14 — iCalendar (.ics) builder for a single booking.
//
// One pure builder shared by the parent bookings page ("Add to calendar"
// download) and the Stripe-webhook confirmation emails (CF-NOTIFY-03
// attachment). Session times are UK wall-clock in the DB; they are converted
// to true UTC instants via the Europe/London offset (BST-safe) and emitted as
// Z-times — universally understood, no VTIMEZONE block needed (RFC 5545
// §3.3.5 form 2).

import { londonSessionToMs } from '@/lib/time/london'

export interface BookingIcsParams {
  /** UID seed — the booking reference is globally unique (CF-NOTIFY-03 spec)
   *  and the SAME event identity must come from the page download and the
   *  email attachment, so calendars dedupe rather than duplicate. */
  bookingReference: string
  /** e.g. "Cricket session with Ravi Patel" is derived from these two. */
  sportName: string
  coachName: string
  /** 'YYYY-MM-DD' + 'HH:MM[:SS]' UK wall-clock, straight from the DB. */
  sessionDate: string
  startTime: string
  endTime: string
  /** Venue display string, or null when unknown. */
  venue: string | null
  /** Who booked — adds a "Booked by" description line (coach's copy). */
  bookerName?: string
  /** Epoch ms for DTSTAMP — injected so callers/tests control "now". */
  nowMs: number
}

/** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma, newline. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Epoch ms → basic-format UTC date-time, e.g. 20260827T090000Z. */
function toIcsUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/**
 * RFC 5545 §3.1 line folding: lines longer than 75 octets are split with
 * CRLF + single space. Folding on characters (not octets) is safe here —
 * it only ever folds earlier than strictly required.
 */
function foldIcsLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  let rest = line
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74))
    rest = rest.slice(74)
  }
  chunks.push(rest)
  return chunks.join('\r\n ')
}

/** Builds the complete .ics file body (CRLF line endings) for one booking. */
export function buildBookingIcs(params: BookingIcsParams): string {
  const startMs = londonSessionToMs(params.sessionDate, params.startTime)
  const endMs = londonSessionToMs(params.sessionDate, params.endTime)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Crikly//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${params.bookingReference.replace(/[^A-Za-z0-9-]/g, '')}@crikly.app`,
    `DTSTAMP:${toIcsUtc(params.nowMs)}`,
    `DTSTART:${toIcsUtc(startMs)}`,
    `DTEND:${toIcsUtc(endMs)}`,
    `SUMMARY:${escapeIcsText(`${params.sportName} session with ${params.coachName}`)}`,
    ...(params.venue ? [`LOCATION:${escapeIcsText(params.venue)}`] : []),
    `DESCRIPTION:${escapeIcsText(
      `Booking reference: ${params.bookingReference}\nCoach: ${params.coachName}` +
        (params.bookerName ? `\nBooked by: ${params.bookerName}` : ''),
    )}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

/** Download filename for a booking's .ics — safe, reference-based. */
export function bookingIcsFilename(bookingReference: string): string {
  return `crikly-${bookingReference.replace(/[^A-Za-z0-9-]/g, '')}.ics`
}
