// CF-PROG-START-DATE: pure session-date generator shared between the
// CreateProgramme / EditProgramme preview UI and the server-side ends_at
// derivation in the POST + PATCH handlers.
//
// Returns an array of 'YYYY-MM-DD' strings — the projected session dates.
// Returns [] on any invalid input (empty start date, empty days array,
// invalid date string, count < 1, end_date before start_date, etc.).

export interface SessionDatesInput {
  /** ISO date 'YYYY-MM-DD'. The earliest possible session date. */
  startDate: string
  /** 0=Sunday … 6=Saturday */
  days: number[]
  mode: 'count' | 'end_date'
  /** Used when mode='count'. Ignored otherwise. */
  count: number
  /** ISO date 'YYYY-MM-DD'. Used when mode='end_date'. Ignored otherwise. */
  endDate: string
}

function toYYYYMMDD(d: Date): string {
  // CF-PROG-SESSION-LIST: format from LOCAL components, not UTC.
  // `d.toISOString()` returns UTC, which in positive-UTC timezones (e.g. BST)
  // shifts local midnight back to the previous calendar day — produced session
  // dates one day before the selected weekday.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function generateProgrammeSessionDates(input: SessionDatesInput): string[] {
  const { startDate, days, mode, count, endDate } = input
  const out: string[] = []
  if (!startDate || days.length === 0) return out

  const start = new Date(startDate + 'T00:00:00')
  if (Number.isNaN(start.getTime())) return out

  if (mode === 'count') {
    if (count < 1) return out
    const cur = new Date(start)
    // Worst-case weekly pattern is one qualifying day per 7-day window
    // (e.g. days=[6] only). Bump if fortnightly (count * 14) is ever added.
    const limit = count * 7
    let iter = 0
    while (out.length < count && iter < limit) {
      if (days.includes(cur.getDay())) {
        out.push(toYYYYMMDD(cur))
      }
      cur.setDate(cur.getDate() + 1)
      iter++
    }
    return out
  }

  // mode === 'end_date'
  if (!endDate) return out
  const end = new Date(endDate + 'T00:00:00')
  if (Number.isNaN(end.getTime())) return out
  const cur = new Date(start)
  // Defensive cap — UI constrains inputs but the lib runs server-side too.
  // 1000 dates ≈ 19 years of weekly sessions; comfortably above any real value.
  while (cur <= end && out.length < 1000) {
    if (days.includes(cur.getDay())) out.push(toYYYYMMDD(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}
