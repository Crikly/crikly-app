// P-10 Phase 2: slot validation + per-block price-override resolution shared
// by POST /api/guest/bookings and POST /api/parent/bookings. Extracted
// VERBATIM from the guest route (BUG-09 override block + BUG-19 Phase 1 /
// BUG-21 slot validation) so the two write sides — and the public calendar
// read side, via the same lib/availability primitives — can never drift.
// The guest route's unit suite exercises this logic end-to-end through its
// mocked Supabase client, so equivalence is test-enforced.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  bookableSlots,
  isDateWithinBookingWindow,
  clearsMinAdvance,
  type SlotTemplate,
} from '@/lib/availability/slots'
import { getCoachCommitments, findFirstConflict } from '@/lib/availability/commitments'
import { hhmmToMinutes } from '@/lib/availability/overlap'

type Client = SupabaseClient<Database>

interface TemplateMembershipRow {
  sport_id: string | null
  day_of_week: number
  start_time: string
  end_time: string
  is_recurring: boolean | null
  specific_date: string | null
}

/**
 * BUG-09: a coach can set a per-block price override on an availability
 * template (e.g. £75 for Sunday mornings vs a £60 sport default). The client
 * was shown — and the anti-tamper check must accept — that overridden figure.
 * Overrides are surfaced on the 1-on-1 slot picker only, so they apply to
 * individual sessions only (group bookings price from tiers).
 *
 * Mirrors the public availability query exactly (GET
 * /api/coaches/[id]/availability): active templates for this coach, matching
 * the sport or sport-agnostic (sport_id IS NULL), on the booking's weekday.
 * The matching block is the one whose window CONTAINS the start time — one
 * block spans several stride-length start slots. No matching block, or a
 * null/zero override, falls through to the sport default — never a 500
 * (BUG-09 graceful fallback).
 *
 * Returns { price } or { failed: true } (query error — caller 500s; the
 * error has already been logged here).
 */
export async function resolveIndividualCanonicalPrice(
  supabase: Client,
  args: {
    coachId: string
    sportId: string
    date: string
    startTime: string
    sportDefaultPence: number
    logPrefix: string
  },
): Promise<{ price: number; failed?: never } | { failed: true }> {
  // Weekday from the YYYY-MM-DD string, computed in UTC so BST/GMT never
  // shifts it — matches the client, which derives the same weekday from the
  // same string.
  const [year, month, day] = args.date.split('-').map(Number)
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay()

  const { data: templates, error: templateError } = await supabase
    .from('availability_templates')
    .select('start_time, end_time, price_override_pence')
    .eq('coach_profile_id', args.coachId)
    .eq('is_active', true)
    .eq('day_of_week', dayOfWeek)
    .or(`sport_id.eq.${args.sportId},sport_id.is.null`)

  if (templateError) {
    console.error(`${args.logPrefix} availability_templates lookup failed:`, templateError)
    return { failed: true }
  }

  // Compare on HH:MM (DB time is HH:MM:SS, client sends HH:MM). The
  // no-overlap business rule means at most one block matches; if a
  // misconfiguration yields several, the first with a usable override wins
  // (deterministic, conservative).
  const startHHMM = args.startTime.slice(0, 5)
  const match = (templates ?? []).find((t) => {
    const blockStart = t.start_time.slice(0, 5)
    const blockEnd = t.end_time.slice(0, 5)
    return blockStart <= startHHMM && startHHMM < blockEnd
  })

  if (match?.price_override_pence != null && match.price_override_pence > 0) {
    return { price: match.price_override_pence }
  }
  return { price: args.sportDefaultPence }
}

export type SlotAvailabilityResult =
  | { ok: true }
  | { ok: false; status: 500; error: 'internal_error' }
  | {
      ok: false
      status: 409
      error: 'date_blocked' | 'outside_booking_window' | 'slot_not_available' | 'slot_taken'
      reason?: string
    }

/**
 * BUG-19 Phase 1 (closes BUG-21): validate a requested slot against the
 * coach's REAL availability before any money object exists. The slot must be
 * one that bookableSlots() — the exact function the public calendar renders
 * from — would emit for this date: inside an active availability block
 * (recurring or ad-hoc), not on a blocked date, inside the coach's min/max
 * advance window, and not overlapping a committed programme session or a
 * live 1-on-1 booking — including overlapping-but-unequal start times, which
 * the migration-034 unique index (23505 → slot_taken at insert, kept in the
 * routes as the same-slot race backstop) cannot catch.
 *
 * Template membership deliberately ignores sport, matching the calendar (its
 * availability fetch passes no sport filter) — approved in BUG-19 Phase 1
 * Step 0. Do not tighten to sport-matched templates here.
 *
 * BUG-51: each template carries its own sport's duration, mirroring the
 * availability API — the calendar strides a Tennis block by Tennis's session
 * length even when the visitor books Cricket, so this validation must too.
 */
export async function validateSlotAvailability(
  supabase: Client,
  args: {
    coachId: string
    date: string
    startTime: string
    minAdvanceHours: number
    maxAdvanceDays: number
    /** The booked sport's session length — the sport-agnostic template fallback stride. */
    bookedSportDurationMinutes: number
    logPrefix: string
  },
): Promise<SlotAvailabilityResult> {
  const { data: allTemplates, error: allTemplatesError } = await supabase
    .from('availability_templates')
    .select('sport_id, day_of_week, start_time, end_time, is_recurring, specific_date')
    .eq('coach_profile_id', args.coachId)
    .eq('is_active', true)

  if (allTemplatesError) {
    console.error(`${args.logPrefix} slot-validation template lookup failed:`, allTemplatesError)
    return { ok: false, status: 500, error: 'internal_error' }
  }

  // BUG-51: sport_id → session length for ALL the coach's active sports.
  // Same resolution the availability API performs, so read and write stride
  // identically.
  const { data: allSportRows, error: allSportsError } = await supabase
    .from('coach_sports')
    .select('sport_id, session_duration_minutes')
    .eq('coach_profile_id', args.coachId)
    .eq('is_active', true)

  if (allSportsError) {
    console.error(`${args.logPrefix} coach_sports durations lookup failed:`, allSportsError)
    return { ok: false, status: 500, error: 'internal_error' }
  }

  const durationBySport: Record<string, number> = Object.fromEntries(
    ((allSportRows ?? []) as { sport_id: string; session_duration_minutes: number }[]).map(
      (s) => [s.sport_id, s.session_duration_minutes],
    ),
  )

  const { data: blockedRows, error: blockedError } = await supabase
    .from('blocked_dates')
    .select('blocked_date, blocked_date_end')
    .eq('coach_profile_id', args.coachId)

  if (blockedError) {
    console.error(`${args.logPrefix} blocked_dates lookup failed:`, blockedError)
    return { ok: false, status: 500, error: 'internal_error' }
  }

  // A date is blocked when it falls inside any blocked range (single-day rows
  // have no end). ISO-string comparison is safe for YYYY-MM-DD.
  const isBlocked = ((blockedRows ?? []) as { blocked_date: string; blocked_date_end: string | null }[]).some(
    (r) => {
      const rangeStart = r.blocked_date.slice(0, 10)
      const rangeEnd = (r.blocked_date_end ?? r.blocked_date).slice(0, 10)
      return rangeStart <= args.date && args.date <= rangeEnd
    },
  )

  // Busy intervals from the shared aggregator (BUG-16/17/18 guards):
  // programme sessions + live bookings ONLY — for a 1-on-1 booking,
  // availability templates are the valid zone, not a conflict.
  const busy = await getCoachCommitments(supabase, args.coachId, args.date, {
    sources: ['programme', 'booking'],
  })

  const slotTemplates: SlotTemplate[] = ((allTemplates ?? []) as TemplateMembershipRow[]).map((t) => ({
    day_of_week: t.day_of_week,
    start_time: t.start_time,
    end_time: t.end_time,
    is_recurring: t.is_recurring ?? true,
    specific_date: t.specific_date ? t.specific_date.slice(0, 10) : null,
    // BUG-51: per-template stride — sport-agnostic templates (null) fall back
    // to the booked sport's duration passed to bookableSlots below.
    session_duration_minutes:
      t.sport_id !== null ? durationBySport[t.sport_id] ?? null : null,
  }))

  // Server-local midnight for the session date; bookableSlots does all its
  // boundary maths off this + `now` exactly as the calendar client does.
  const [bookYear, bookMonth, bookDay] = args.date.split('-').map(Number)
  const sessionDate = new Date(bookYear, bookMonth - 1, bookDay)
  const now = new Date()

  const daySlots = bookableSlots(
    sessionDate,
    slotTemplates,
    isBlocked ? new Set([args.date]) : new Set<string>(),
    args.minAdvanceHours,
    args.maxAdvanceDays,
    now,
    args.bookedSportDurationMinutes,
    busy,
  )

  const requestedHHMM = args.startTime.slice(0, 5)
  if (daySlots.some((s) => s.time === requestedHHMM)) {
    return { ok: true }
  }

  // Diagnose WHY for a specific, friendly 409 — all before any money object
  // is created.
  if (isBlocked) {
    return { ok: false, status: 409, error: 'date_blocked' }
  }

  const startMinutes = hhmmToMinutes(args.startTime)
  if (
    !isDateWithinBookingWindow(sessionDate, now, args.maxAdvanceDays) ||
    !clearsMinAdvance(sessionDate, startMinutes, args.minAdvanceHours, now)
  ) {
    return { ok: false, status: 409, error: 'outside_booking_window' }
  }

  // slot_taken is only the honest reason when the slot WOULD exist absent
  // the busy intervals — i.e. a commitment consumed a genuinely offered
  // slot. A time that overlaps, say, an evening programme but was never
  // inside any availability block must report slot_not_available, not a
  // phantom conflict.
  const slotsIgnoringBusy = bookableSlots(
    sessionDate,
    slotTemplates,
    new Set<string>(),
    args.minAdvanceHours,
    args.maxAdvanceDays,
    now,
    args.bookedSportDurationMinutes,
    [],
  )
  const wouldExist = slotsIgnoringBusy.find((s) => s.time === requestedHHMM)
  if (wouldExist) {
    // BUG-51: diagnose with the slot's OWN duration (its template's sport),
    // matching the window bookableSlots used to suppress it.
    const conflict = findFirstConflict(
      startMinutes,
      startMinutes + wouldExist.durationMinutes,
      busy,
    )
    return {
      ok: false,
      status: 409,
      error: 'slot_taken',
      ...(conflict ? { reason: `This time overlaps ${conflict.label}.` } : {}),
    }
  }

  // Not inside any active availability block for this date.
  return { ok: false, status: 409, error: 'slot_not_available' }
}
