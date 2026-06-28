// P-00b-D2: pure, framework-free helpers for the coach availability calendar.
// Kept separate from the React component so the slot / blocked / booking-window
// logic is unit-testable in isolation (no DOM, no Supabase, no React).

export interface SlotTemplate {
  /** 0 = Sunday … 6 = Saturday (matches availability_templates.day_of_week). */
  day_of_week: number
  /** 'HH:MM' (24h). */
  start_time: string
  /** 'HH:MM' (24h). */
  end_time: string
  /**
   * BUG-08: per-block price override in pence, or null to use the coach's sport
   * default. Mirrors availability_templates.price_override_pence.
   */
  price_override_pence?: number | null
}

export interface GeneratedSlot {
  /** Minutes from midnight, e.g. 570 = 09:30. */
  minutes: number
  /** 'HH:MM' (24h) — used in the booking URL. */
  time: string
  /** '9:30am' — display label. */
  label: string
  /**
   * KNOWN LIMITATION (P-00b-D2, accepted deferral): always true today. Real
   * booked-slot data is deferred until the booking API (Step 5 — CD-06/07).
   * Guests have no RLS-visible per-slot booking data, so every generated slot
   * is surfaced as available. The grid still renders a distinct "booked"
   * visual state; it is simply never produced here yet.
   */
  available: boolean
  /**
   * BUG-08: this slot's price override in pence, inherited from its source
   * template, or null when the template has no override (caller falls back to
   * the coach's sport default).
   */
  pricePence: number | null
}

// Fallback session length when a coach's sport carries no duration.
const DEFAULT_SESSION_MINUTES = 60

/** Local-timezone YYYY-MM-DD (avoids the UTC-midnight shift in BST etc.). */
export function localISODate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 570 → '9:30am'. */
export function formatSlotLabel(minutes: number): string {
  let h = Math.floor(minutes / 60)
  const m = minutes % 60
  const ap = h < 12 ? 'am' : 'pm'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')}${ap}`
}

/** 'HH:MM' → '9:30am' (for programme session times). */
export function formatTimeLabel(hhmm: string): string {
  return formatSlotLabel(toMinutes(hhmm))
}

/**
 * The bookable 1-on-1 start slots for a given day, or [] when the day is in the
 * past, blocked, beyond the coach's max-advance window, or has no template that
 * weekday. Slots that fall inside the min-advance window are filtered out.
 */
export function bookableSlots(
  date: Date,
  templates: SlotTemplate[],
  blocked: Set<string>,
  minAdvanceHours: number,
  maxAdvanceDays: number,
  now: Date,
  sessionDurationMinutes: number,
): GeneratedSlot[] {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  if (date < startOfToday) return []

  const maxDate = new Date(startOfToday)
  maxDate.setDate(maxDate.getDate() + maxAdvanceDays)
  if (date > maxDate) return []

  if (blocked.has(localISODate(date))) return []

  const dow = date.getDay()
  const minAdvanceMs = minAdvanceHours * 3600 * 1000

  // Step by the session length and only emit a slot if the whole session fits
  // inside the template window (start + duration <= end). e.g. 09:00–10:00 with
  // a 60-min session yields exactly one slot (09:00), not two. Overlapping
  // template ranges are deduped into a single sorted set of start times.
  //
  // BUG-08: each start time also carries its source template's price override so
  // the picker can price the slot. Business rule forbids overlapping blocks on
  // the same day, so a given start minute maps to exactly one template; if two
  // ever collide, the first-seen template's price wins (Map keeps the earlier).
  const stride = sessionDurationMinutes > 0 ? sessionDurationMinutes : DEFAULT_SESSION_MINUTES
  const minutesPrice = new Map<number, number | null>()
  for (const t of templates) {
    if (t.day_of_week !== dow) continue
    const start = toMinutes(t.start_time)
    const end = toMinutes(t.end_time)
    const price = t.price_override_pence ?? null
    for (let mins = start; mins + stride <= end; mins += stride) {
      if (!minutesPrice.has(mins)) minutesPrice.set(mins, price)
    }
  }

  const sorted = Array.from(minutesPrice.keys()).sort((a, b) => a - b)
  const out: GeneratedSlot[] = []
  for (const minutes of sorted) {
    const slotTime = new Date(date)
    slotTime.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    if (slotTime.getTime() - now.getTime() < minAdvanceMs) continue
    out.push({
      minutes,
      time: toHHMM(minutes),
      label: formatSlotLabel(minutes),
      available: true,
      pricePence: minutesPrice.get(minutes) ?? null,
    })
  }
  return out
}
