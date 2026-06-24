// Unit tests for src/lib/booking/guest-checkout.ts
//
// Pure functions — no imports of Next.js / Supabase / Stripe. Tests run in Node
// environment (default for this repo, see jest.config.ts). No mocks required.
//
// Business rules covered:
//   BR-01  Commission added ON TOP of coach price.
//   BR-10  All money values are integers (pence).
//   BR-12  Booking reference format CRK-YYYY-XXXXXX, alphabet excludes 0/O/1/I.

import {
  computeBookingTotals,
  generateBookingReference,
  addMinutesToTime,
  isValidDate,
  isValidTime,
  isValidEmail,
} from '@/lib/booking/guest-checkout'

// ── computeBookingTotals (BR-01, BR-10) ───────────────────────────────────────

describe('computeBookingTotals', () => {
  // Canonical BR-01 example from docs/05_BUSINESS_RULES.md
  it('BR-01: adds commission ON TOP — canonical example 6000 @ 10%', () => {
    const result = computeBookingTotals(6000, 0.10)
    expect(result.commissionPence).toBe(600)
    expect(result.parentTotalPence).toBe(6600)
  })

  it('BR-01: coach always receives the full coach price (not deducted)', () => {
    // parentTotalPence = coachPrice + commission, coachPrice unchanged
    const coachPrice = 6000
    const result = computeBookingTotals(coachPrice, 0.10)
    // The difference between what parent pays and commission IS the coach price
    expect(result.parentTotalPence - result.commissionPence).toBe(coachPrice)
  })

  it('BR-10: commissionPence is an integer', () => {
    const result = computeBookingTotals(6000, 0.10)
    expect(typeof result.commissionPence).toBe('number')
    expect(Number.isInteger(result.commissionPence)).toBe(true)
  })

  it('BR-10: parentTotalPence is an integer', () => {
    const result = computeBookingTotals(6000, 0.10)
    expect(typeof result.parentTotalPence).toBe('number')
    expect(Number.isInteger(result.parentTotalPence)).toBe(true)
  })

  it('rounds commission half-up via Math.round — £59.99 @ 10%', () => {
    // 5999 * 0.10 = 599.9 → rounds to 600
    const result = computeBookingTotals(5999, 0.10)
    expect(result.commissionPence).toBe(600)
    expect(result.parentTotalPence).toBe(6599)
    expect(Number.isInteger(result.commissionPence)).toBe(true)
  })

  it('rounds commission half-up — value that rounds down', () => {
    // 5994 * 0.10 = 599.4 → rounds to 599
    const result = computeBookingTotals(5994, 0.10)
    expect(result.commissionPence).toBe(599)
    expect(result.parentTotalPence).toBe(6593)
  })

  it('handles 0% commission rate (free platform offer)', () => {
    const result = computeBookingTotals(6000, 0)
    expect(result.commissionPence).toBe(0)
    expect(result.parentTotalPence).toBe(6000)
  })

  it('handles non-round commission rate — 7.5%', () => {
    // 4000 * 0.075 = 300 exactly
    const result = computeBookingTotals(4000, 0.075)
    expect(result.commissionPence).toBe(300)
    expect(result.parentTotalPence).toBe(4300)
    expect(Number.isInteger(result.commissionPence)).toBe(true)
  })

  it('handles non-round commission rate that requires rounding — 7.5% on 5999', () => {
    // 5999 * 0.075 = 449.925 → rounds to 450
    const result = computeBookingTotals(5999, 0.075)
    expect(result.commissionPence).toBe(450)
    expect(result.parentTotalPence).toBe(6449)
  })

  it('handles a price of 0 pence', () => {
    const result = computeBookingTotals(0, 0.10)
    expect(result.commissionPence).toBe(0)
    expect(result.parentTotalPence).toBe(0)
  })

  it('handles a very small price — 1 pence @ 10%', () => {
    // 1 * 0.10 = 0.1 → rounds to 0
    const result = computeBookingTotals(1, 0.10)
    expect(result.commissionPence).toBe(0)
    expect(result.parentTotalPence).toBe(1)
    expect(Number.isInteger(result.commissionPence)).toBe(true)
  })
})

// ── generateBookingReference (BR-12) ─────────────────────────────────────────

const VALID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const FORBIDDEN_CHARS = ['0', 'O', '1', 'I']

describe('generateBookingReference', () => {
  it('BR-12: format is CRK-YYYY-XXXXXX', () => {
    const ref = generateBookingReference(2026)
    // Format-only — forbidden glyphs (0/O/1/I) are enforced by the alphabet exclusion tests below
    expect(ref).toMatch(/^CRK-\d{4}-[A-Z0-9]{6}$/)
  })

  it('embeds the year correctly', () => {
    const ref = generateBookingReference(2026)
    expect(ref.startsWith('CRK-2026-')).toBe(true)
  })

  it('suffix is exactly 6 characters', () => {
    const ref = generateBookingReference(2026)
    const suffix = ref.split('-')[2]
    expect(suffix).toHaveLength(6)
  })

  it('BR-12: alphabet never contains 0 or O (ambiguous glyph exclusion)', () => {
    // Use injectable randomIndex to cover every possible character in the alphabet
    for (let i = 0; i < VALID_ALPHABET.length; i++) {
      const ref = generateBookingReference(2026, () => i)
      const suffix = ref.split('-')[2]
      for (const char of suffix) {
        expect(FORBIDDEN_CHARS).not.toContain(char)
      }
    }
  })

  it('BR-12: alphabet never contains 1 or I (ambiguous glyph exclusion)', () => {
    for (let i = 0; i < VALID_ALPHABET.length; i++) {
      const ref = generateBookingReference(2026, () => i)
      const suffix = ref.split('-')[2]
      for (const char of suffix) {
        expect(FORBIDDEN_CHARS).not.toContain(char)
      }
    }
  })

  it('deterministic output with injectable randomIndex — always picks index 0', () => {
    // Index 0 in REFERENCE_ALPHABET is '2'
    const ref = generateBookingReference(2026, () => 0)
    expect(ref).toBe('CRK-2026-222222')
  })

  it('deterministic output with injectable randomIndex — cycling pattern', () => {
    // Indices 0..5 → chars '2','3','4','5','6','7'
    let callCount = 0
    const ref = generateBookingReference(2026, () => callCount++)
    expect(ref).toBe('CRK-2026-234567')
  })

  it('works for a different year', () => {
    const ref = generateBookingReference(2030, () => 0)
    expect(ref).toBe('CRK-2030-222222')
  })

  it('produces two different references for two calls (random by default)', () => {
    // With crypto.randomInt the chance of collision is ~1 in 1e9 — negligible in testing
    const ref1 = generateBookingReference(2026)
    const ref2 = generateBookingReference(2026)
    // Format-only regex — forbidden glyphs (0/O/1/I) asserted by alphabet exclusion tests above
    expect(ref1).toMatch(/^CRK-2026-[A-Z0-9]{6}$/)
    expect(ref2).toMatch(/^CRK-2026-[A-Z0-9]{6}$/)
    expect(ref1).not.toBe(ref2)
  })
})

// ── addMinutesToTime ───────────────────────────────────────────────────────────

describe('addMinutesToTime', () => {
  it('adds 60 minutes to 10:00 → 11:00:00', () => {
    expect(addMinutesToTime('10:00', 60)).toBe('11:00:00')
  })

  it('adds 30 minutes to 10:00 → 10:30:00', () => {
    expect(addMinutesToTime('10:00', 30)).toBe('10:30:00')
  })

  it('adds 90 minutes to 10:00 → 11:30:00', () => {
    expect(addMinutesToTime('10:00', 90)).toBe('11:30:00')
  })

  it('handles HH:MM:SS input format', () => {
    expect(addMinutesToTime('10:00:00', 60)).toBe('11:00:00')
  })

  it('adds minutes that cross an hour boundary', () => {
    expect(addMinutesToTime('10:45', 45)).toBe('11:30:00')
  })

  it('returns null when result crosses midnight (23:30 + 60)', () => {
    expect(addMinutesToTime('23:30', 60)).toBeNull()
  })

  it('returns null at exact midnight boundary (23:59 + 1)', () => {
    expect(addMinutesToTime('23:59', 1)).toBeNull()
  })

  it('returns null for malformed time — missing colon', () => {
    expect(addMinutesToTime('1000', 60)).toBeNull()
  })

  it('returns null for malformed time — letters', () => {
    expect(addMinutesToTime('AB:CD', 60)).toBeNull()
  })

  it('returns null for malformed time — empty string', () => {
    expect(addMinutesToTime('', 60)).toBeNull()
  })

  it('returns null when durationMinutes is 0', () => {
    expect(addMinutesToTime('10:00', 0)).toBeNull()
  })

  it('returns null when durationMinutes is negative', () => {
    expect(addMinutesToTime('10:00', -30)).toBeNull()
  })

  it('returns null when durationMinutes is a float', () => {
    expect(addMinutesToTime('10:00', 30.5)).toBeNull()
  })

  it('handles session ending exactly at 23:59:00 (valid)', () => {
    // 22:59 + 60 = 23:59 — last valid minute, total = 23*60+59 = 1439 < 1440
    expect(addMinutesToTime('22:59', 60)).toBe('23:59:00')
  })
})

// ── validators ────────────────────────────────────────────────────────────────

describe('isValidDate', () => {
  it('accepts a valid ISO date string', () => {
    expect(isValidDate('2026-06-27')).toBe(true)
  })

  it('rejects a date with slashes', () => {
    expect(isValidDate('2026/06/27')).toBe(false)
  })

  it('rejects a date-time string', () => {
    expect(isValidDate('2026-06-27T10:00:00')).toBe(false)
  })

  it('rejects a number', () => {
    expect(isValidDate(20260627)).toBe(false)
  })

  it('rejects null', () => {
    expect(isValidDate(null)).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidDate('')).toBe(false)
  })
})

describe('isValidTime', () => {
  it('accepts HH:MM format', () => {
    expect(isValidTime('10:00')).toBe(true)
  })

  it('accepts HH:MM:SS format', () => {
    expect(isValidTime('10:00:00')).toBe(true)
  })

  it('rejects a bare number string', () => {
    expect(isValidTime('1000')).toBe(false)
  })

  it('rejects a full ISO datetime', () => {
    expect(isValidTime('2026-06-27T10:00')).toBe(false)
  })

  it('rejects null', () => {
    expect(isValidTime(null)).toBe(false)
  })
})

describe('isValidEmail', () => {
  it('accepts a standard email address', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })

  it('accepts a subdomain email', () => {
    expect(isValidEmail('user@mail.example.co.uk')).toBe(true)
  })

  it('rejects an email with no @', () => {
    expect(isValidEmail('notanemail')).toBe(false)
  })

  it('rejects an email with no domain', () => {
    expect(isValidEmail('user@')).toBe(false)
  })

  it('rejects an email with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false)
  })

  it('rejects null', () => {
    expect(isValidEmail(null)).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidEmail('')).toBe(false)
  })
})
