// P-14 — pure display formatters for the parent bookings page. All date
// labels format the raw DB wall-clock values (session_date IS the London
// calendar date — no timezone conversion belongs here; instant maths lives
// in lib/time/london).

/** "10:00:00" → "10am" · "10:30" → "10.30am" · "16:05" → "4.05pm" */
export function formatTimeLabel(time: string): string {
  const [hRaw = 0, mRaw = 0] = time.split(':').map(Number)
  const suffix = hRaw < 12 ? 'am' : 'pm'
  const h12 = hRaw % 12 === 0 ? 12 : hRaw % 12
  const minutes = mRaw === 0 ? '' : `.${String(mRaw).padStart(2, '0')}`
  return `${h12}${minutes}${suffix}`
}

/** Minutes → "(1 hr)" · "(1.5 hrs)" · "(45 mins)" */
export function formatDurationLabel(startTime: string, endTime: string): string {
  const [sh = 0, sm = 0] = startTime.split(':').map(Number)
  const [eh = 0, em = 0] = endTime.split(':').map(Number)
  const minutes = eh * 60 + em - (sh * 60 + sm)
  if (minutes <= 0) return ''
  if (minutes % 60 === 0) {
    const hrs = minutes / 60
    return hrs === 1 ? '(1 hr)' : `(${hrs} hrs)`
  }
  if (minutes > 60 && minutes % 30 === 0) return `(${minutes / 60} hrs)`
  return `(${minutes} mins)`
}

function dateFromDateString(dateStr: string): Date {
  // Parse as UTC midnight and format in UTC — keeps the London calendar
  // date intact regardless of server timezone.
  return new Date(`${dateStr}T00:00:00Z`)
}

/**
 * "Thursday, 27 August" — with "Today"/"Tomorrow" replacing the weekday when
 * the session's London date matches. todayStr/tomorrowStr come from
 * lib/time/london so the comparison is BST-safe.
 */
export function formatDayLabel(
  dateStr: string,
  todayStr: string,
  tomorrowStr: string,
): string {
  const date = dateFromDateString(dateStr)
  const dayMonth = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  if (dateStr === todayStr) return `Today, ${dayMonth}`
  if (dateStr === tomorrowStr) return `Tomorrow, ${dayMonth}`
  const weekday = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  })
  return `${weekday}, ${dayMonth}`
}

/** "Thu 27 Aug, 10am" — compact list-row variant of formatDayLabel. */
export function formatShortWhenLabel(
  dateStr: string,
  startTime: string,
  todayStr: string,
  tomorrowStr: string,
): string {
  const time = formatTimeLabel(startTime)
  if (dateStr === todayStr) return `Today, ${time}`
  if (dateStr === tomorrowStr) return `Tomorrow, ${time}`
  const date = dateFromDateString(dateStr)
  const label = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  return `${label}, ${time}`
}

/** Full card line: "Thursday, 27 August · 10am – 11am (1 hr)" */
export function formatWhenLabel(
  dateStr: string,
  startTime: string,
  endTime: string,
  todayStr: string,
  tomorrowStr: string,
): string {
  const day = formatDayLabel(dateStr, todayStr, tomorrowStr)
  const duration = formatDurationLabel(startTime, endTime)
  const range = `${formatTimeLabel(startTime)} – ${formatTimeLabel(endTime)}`
  return duration ? `${day} · ${range} ${duration}` : `${day} · ${range}`
}

/** Display-only pence → "£55.00". Never store the result back. */
export function formatPaidLabel(pence: number, currency: string): string {
  const amount = (pence / 100).toFixed(2)
  return currency === 'GBP' ? `£${amount}` : `${currency} ${amount}`
}

/** "Ravi Patel" → "RP" (max two initials, matching the design's avatar). */
export function coachInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('')
}

/**
 * Deterministic identity-palette colour for a coach's initials circle —
 * hash of a stable id so the hue never changes between renders or tabs.
 * Reuses CHILD_IDENTITY_COLOURS via childIdentityColour (design-system
 * identity palette).
 */
export function stableColourIndex(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** "Cricket · 1-to-1" | "Cricket · Group · 6 players" */
export function formatSessionLine(
  sportName: string,
  sessionType: string,
  playerCount: number,
): string {
  if (sessionType === 'group') {
    return playerCount > 1
      ? `${sportName} · Group · ${playerCount} players`
      : `${sportName} · Group`
  }
  return `${sportName} · 1-to-1`
}
