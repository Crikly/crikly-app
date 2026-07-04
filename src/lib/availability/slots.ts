// P-00b-D2: pure, framework-free helpers for the coach availability calendar.
// Kept separate from the React component so the slot / blocked / booking-window
// logic is unit-testable in isolation (no DOM, no Supabase, no React).
//
// BUG-19 Phase 1: moved here from
// src/app/coaches/[id]/availability/_components/_data/slots.ts so the guest
// bookings API route (POST /api/guest/bookings) validates a requested slot with
// the EXACT same function the public calendar renders from — read side and
// write side cannot drift. The old path re-exports this module for the UI.

import { overlapsAny, type Interval } from './overlap'

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
  /**
   * UX-09: where this block's sessions take place (resolved venue label), or
   * null/absent when the coach set no venue. Mirrors the API's resolved
   * availability_templates.venue_name.
   */
  venue_name?: string | null
  /**
   * BUG-04: false = an ad-hoc one-off block, placed on specific_date only.
   * Absent/true = a weekly-recurring block, placed by day_of_week. Mirrors
   * availability_templates.is_recurring (DB default is true).
   */
  is_recurring?: boolean
  /**
   * BUG-04: 'YYYY-MM-DD' for an ad-hoc block (the single date it applies to);
   * null/absent for a recurring block. Mirrors availability_templates.specific_date.
   */
  specific_date?: string | null
}

export interface GeneratedSlot {
  /** Minutes from midnight, e.g. 570 = 09:30. */
  minutes: number
  /** 'HH:MM' (24h) — used in the booking URL. */
  time: string
  /** '9:30am' — display label. */
  label: string
  /**
   * Always true: a slot that collides with a busy interval (programme session
   * or live booking — BUG-14/BUG-16) is suppressed entirely rather than emitted
   * as unavailable, so every slot this function returns is genuinely bookable.
   * (The P-00b-D2 "booked-slot data deferred" limitation is closed as of
   * BUG-19 Phase 1 — callers now pass live bookings in `busyIntervals`.)
   */
  available: boolean
  /**
   * BUG-08: this slot's price override in pence, inherited from its source
   * template, or null when the template has no override (caller falls back to
   * the coach's sport default).
   */
  pricePence: number | null
  /**
   * UX-09: this slot's venue label, inherited from its source template, or null
   * when the coach set no venue for that block (the picker shows nothing).
   */
  venueName: string | null
  /**
   * BUG-04: true when this slot came from an ad-hoc (is_recurring === false)
   * template — drives the teal "ad hoc" calendar dot. false for recurring slots.
   */
  isAdHoc: boolean
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
 * True when `date` is neither in the past nor beyond the coach's max-advance
 * horizon. Shared by bookableSlots and the guest bookings route's 409
 * diagnosis (BUG-19 Phase 1) so the window arithmetic exists exactly once —
 * a second copy drifting is the read/write-divergence bug class this module
 * exists to prevent.
 */
export function isDateWithinBookingWindow(date: Date, now: Date, maxAdvanceDays: number): boolean {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  if (date < startOfToday) return false
  const maxDate = new Date(startOfToday)
  maxDate.setDate(maxDate.getDate() + maxAdvanceDays)
  return date <= maxDate
}

/**
 * True when a slot starting at `startMinutes` on `date` clears the coach's
 * min-advance window relative to `now`. Shared for the same single-copy
 * reason as isDateWithinBookingWindow.
 */
export function clearsMinAdvance(
  date: Date,
  startMinutes: number,
  minAdvanceHours: number,
  now: Date,
): boolean {
  const slotTime = new Date(date)
  slotTime.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)
  return slotTime.getTime() - now.getTime() >= minAdvanceHours * 3600 * 1000
}

/**
 * The bookable 1-on-1 start slots for a given day, or [] when the day is in the
 * past, blocked, beyond the coach's max-advance window, or has no template that
 * weekday. Slots that fall inside the min-advance window are filtered out.
 *
 * BUG-16 / BUG-14: `busyIntervals` are minute-ranges (from midnight) already
 * committed on this date — group-programme sessions (BUG-16) and live 1-on-1
 * bookings (BUG-14: pending_payment, confirmed, or completed; mirrors migration
 * 034's slot-holding predicate). A generated slot whose [start, start+duration)
 * overlaps any busy interval is suppressed entirely — the commitment always
 * wins, so the colliding slot disappears from the calendar (not just
 * de-emphasised). Defaults to [] → identical behaviour when nothing is
 * committed that day.
 */
export function bookableSlots(
  date: Date,
  templates: SlotTemplate[],
  blocked: Set<string>,
  minAdvanceHours: number,
  maxAdvanceDays: number,
  now: Date,
  sessionDurationMinutes: number,
  busyIntervals: readonly Interval[] = [],
): GeneratedSlot[] {
  if (!isDateWithinBookingWindow(date, now, maxAdvanceDays)) return []

  if (blocked.has(localISODate(date))) return []

  const dow = date.getDay()

  // Step by the session length and only emit a slot if the whole session fits
  // inside the template window (start + duration <= end). e.g. 09:00–10:00 with
  // a 60-min session yields exactly one slot (09:00), not two. Overlapping
  // template ranges are deduped into a single sorted set of start times.
  //
  // BUG-08 / UX-09: each start time also carries its source template's price
  // override and venue so the picker can price and locate the slot. Business rule
  // forbids overlapping blocks on the same day, so a given start minute maps to
  // exactly one template; if two ever collide, the first-seen template wins (Map
  // keeps the earlier).
  //
  // BUG-04: a recurring block (is_recurring absent/true) places on every matching
  // weekday; an ad-hoc block (is_recurring === false) places on its specific_date
  // ONLY — never repeated across weekdays. Each minute also records whether it
  // came from an ad-hoc block so the calendar can render the teal ad-hoc dot.
  const iso = localISODate(date)
  const stride = sessionDurationMinutes > 0 ? sessionDurationMinutes : DEFAULT_SESSION_MINUTES
  const minutesMeta = new Map<number, { price: number | null; venue: string | null; isAdHoc: boolean }>()
  for (const t of templates) {
    const adHoc = t.is_recurring === false
    if (adHoc) {
      if (t.specific_date !== iso) continue
    } else {
      if (t.day_of_week !== dow) continue
    }
    const start = toMinutes(t.start_time)
    const end = toMinutes(t.end_time)
    const price = t.price_override_pence ?? null
    const venue = t.venue_name ?? null
    for (let mins = start; mins + stride <= end; mins += stride) {
      if (!minutesMeta.has(mins)) minutesMeta.set(mins, { price, venue, isAdHoc: adHoc })
    }
  }

  const sorted = Array.from(minutesMeta.keys()).sort((a, b) => a - b)
  const out: GeneratedSlot[] = []
  for (const minutes of sorted) {
    if (!clearsMinAdvance(date, minutes, minAdvanceHours, now)) continue
    // BUG-16 / BUG-14: drop any slot that collides with a committed programme
    // session or a live 1-on-1 booking.
    if (overlapsAny(minutes, minutes + stride, busyIntervals)) continue
    const meta = minutesMeta.get(minutes)
    out.push({
      minutes,
      time: toHHMM(minutes),
      label: formatSlotLabel(minutes),
      available: true,
      pricePence: meta?.price ?? null,
      venueName: meta?.venue ?? null,
      isAdHoc: meta?.isAdHoc ?? false,
    })
  }
  return out
}
