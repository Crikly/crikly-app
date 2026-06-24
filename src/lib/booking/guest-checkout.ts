// P-00c-API — pure helpers for the guest checkout flow.
//
// Kept free of Next.js / Supabase / Stripe imports so they can be unit-tested
// in isolation (commission maths and reference formatting are business-critical).

import { randomInt } from 'node:crypto'

// Crockford-style base32 minus ambiguous glyphs (no 0/O/1/I) so references are
// safe to read aloud and type. 6 chars → ~1.07e9 combinations per year.
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const REFERENCE_LENGTH = 6

/**
 * Generate a human-readable booking reference (BR-12, random variant).
 *
 * Format: `CRK-YYYY-XXXXXX` (e.g. `CRK-2026-7F3A9K`).
 *
 * Uses a cryptographically-strong RNG by default. `randomIndex` is injectable
 * purely so tests can assert exact output deterministically.
 */
export function generateBookingReference(
  year: number,
  randomIndex: (maxExclusive: number) => number = (max) => randomInt(max),
): string {
  let suffix = ''
  for (let i = 0; i < REFERENCE_LENGTH; i += 1) {
    suffix += REFERENCE_ALPHABET[randomIndex(REFERENCE_ALPHABET.length)]
  }
  return `CRK-${year}-${suffix}`
}

export interface BookingTotals {
  commissionPence: number
  parentTotalPence: number
}

/**
 * Commission maths (BR-01): commission is added ON TOP of the coach price.
 *   commission_pence = round(coach_price × rate)
 *   parent_total     = coach_price + commission
 * Coach always receives the full coach price.
 *
 * All money is integer pence (BR-10). Rounding is half-up via Math.round, which
 * is the conventional retail-rounding choice for VAT-style add-ons.
 */
export function computeBookingTotals(
  coachPricePence: number,
  commissionRate: number,
): BookingTotals {
  const commissionPence = Math.round(coachPricePence * commissionRate)
  return {
    commissionPence,
    parentTotalPence: coachPricePence + commissionPence,
  }
}

/**
 * Add `durationMinutes` to a `HH:MM` (or `HH:MM:SS`) time-of-day string and
 * return `HH:MM:SS`. Returns null if the input is malformed or the resulting
 * session would roll past midnight (the bookings table requires end > start on
 * the same day).
 */
export function addMinutesToTime(time: string, durationMinutes: number): string | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time)
  if (!match || !Number.isInteger(durationMinutes) || durationMinutes <= 0) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  const total = hours * 60 + minutes + durationMinutes
  if (total >= 24 * 60) return null // would cross midnight

  const endHours = Math.floor(total / 60)
  const endMinutes = total % 60
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:00`
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(?::\d{2})?$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value)
}
export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value)
}
export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_RE.test(value)
}
