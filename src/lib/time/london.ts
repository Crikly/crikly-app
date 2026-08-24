// P-14 — shared Europe/London wall-clock → epoch helpers.
//
// Session times are stored as naive UK wall-clock (BUG-66): session_date is
// DATE, session_start_time is TIME, no timezone. Parsing them with
// `new Date('YYYY-MM-DDTHH:mm:ss')` interprets that wall-clock in
// SERVER-local time — UTC on Vercel — so during BST the epoch lands 1h late.
// These helpers resolve the true instant via the Europe/London offset at that
// date, staying correct across the BST/GMT switch.
//
// Extracted from coach/dashboard/page.tsx (BUG-66 originals — that file keeps
// its private copy; consolidation is a follow-up). Use ONLY for instant
// comparisons (.ics events, cancellation-window checks, upcoming/past splits)
// — display strings still come from the raw DB values.

const LONDON_PARTS_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function londonWallClockToMs(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const parts = LONDON_PARTS_FMT.formatToParts(new Date(guess))
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  const shownAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
  )
  return guess - (shownAsUtc - guess)
}

/** Booking rows: 'YYYY-MM-DD' + 'HH:MM[:SS]' straight from the DB. */
export function londonSessionToMs(dateStr: string, timeStr: string): number {
  const [y = 0, mo = 1, d = 1] = dateStr.split('-').map(Number)
  const [h = 0, mi = 0] = timeStr.split(':').map(Number)
  return londonWallClockToMs(y, mo, d, h, mi)
}

const LONDON_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The calendar date ('YYYY-MM-DD') it currently is in London. */
export function londonTodayDateString(nowMs: number): string {
  return LONDON_DATE_FMT.format(new Date(nowMs))
}

/** The London calendar date one day after `dateStr` ('YYYY-MM-DD'). */
export function nextDateString(dateStr: string): string {
  const [y = 0, mo = 1, d = 1] = dateStr.split('-').map(Number)
  const next = new Date(Date.UTC(y, mo - 1, d + 1))
  return next.toISOString().slice(0, 10)
}

/**
 * BUG-68: is the London wall-clock session [start, end] in progress at `nowMs`?
 *
 * The dashboard previously compared the server's local `HH:MM:SS` string
 * (UTC on Vercel) against the stored UK wall-clock times, so during BST a
 * 15:00 session only read as active from 16:00 BST. Comparing true instants
 * via the Europe/London offset keeps it correct across the BST/GMT switch.
 * Bounds are inclusive to preserve the prior `>= start && <= end` semantics.
 */
export function isSessionActiveAt(
  dateStr: string,
  startTime: string,
  endTime: string,
  nowMs: number,
): boolean {
  const startMs = londonSessionToMs(dateStr, startTime)
  const endMs = londonSessionToMs(dateStr, endTime)
  return nowMs >= startMs && nowMs <= endMs
}
