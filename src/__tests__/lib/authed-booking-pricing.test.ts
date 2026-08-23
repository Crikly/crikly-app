// Unit tests for src/lib/booking/authed-booking-pricing.ts (P-10)
//
// Business rules covered:
//   BR-01/BR-10  All prices are integer pence; commission is applied
//                elsewhere (commission-display.ts) — these helpers return the
//                COACH price for a selection.
//   CF-PRICE-01  group_price_tiers maps group size ("2".."6") to the TOTAL
//                session price in pence (not per head); sizes absent from the
//                map are unavailable to parents.
//
// No mocks needed — these are pure functions.

import {
  HOLD_DURATION_SECONDS,
  coachPricePence,
  formatHoldClock,
  formatPricePence,
  holdSecondsRemaining,
  playerCountOptions,
} from '@/lib/booking/authed-booking-pricing'

// ─── playerCountOptions ───────────────────────────────────────────────────────

describe('playerCountOptions', () => {
  it('returns [1] when the coach offers no group sessions', () => {
    expect(playerCountOptions(['individual'], null, null)).toEqual([1])
  })

  it('returns [1] when group is enabled but no tiers exist (unbookable group)', () => {
    expect(playerCountOptions(['individual', 'group'], 4, null)).toEqual([1])
    expect(playerCountOptions(['individual', 'group'], 4, {})).toEqual([1])
  })

  it('returns [1] plus every tier size, sorted ascending', () => {
    expect(
      playerCountOptions(['individual', 'group'], 4, { '3': 5500, '2': 4500, '4': 7000 }),
    ).toEqual([1, 2, 3, 4])
  })

  it('CF-PRICE-01: sizes absent from the tier map are unavailable', () => {
    expect(
      playerCountOptions(['individual', 'group'], 4, { '2': 4500, '4': 7000 }),
    ).toEqual([1, 2, 4])
  })

  it('re-applies max_group_size as a safety net over stale tier keys', () => {
    expect(
      playerCountOptions(['individual', 'group'], 3, { '2': 4500, '3': 5500, '4': 7000 }),
    ).toEqual([1, 2, 3])
  })

  it('ignores tiers entirely when session_types lacks group', () => {
    expect(playerCountOptions(['individual'], 4, { '2': 4500 })).toEqual([1])
  })
})

// ─── coachPricePence ──────────────────────────────────────────────────────────

describe('coachPricePence', () => {
  const tiers = { '2': 9000, '3': 12000 }

  it('1 player: uses the slot price override when present (BUG-08)', () => {
    expect(coachPricePence(1, 5500, 6000, tiers)).toBe(5500)
  })

  it('1 player: falls back to price_individual_pence without an override', () => {
    expect(coachPricePence(1, null, 6000, tiers)).toBe(6000)
  })

  it('1 player: null when no individual price is set (CTA must disable)', () => {
    expect(coachPricePence(1, null, null, tiers)).toBeNull()
  })

  it('CF-PRICE-01: group sizes read the TOTAL tier price, never the override', () => {
    expect(coachPricePence(2, 5500, 6000, tiers)).toBe(9000)
    expect(coachPricePence(3, 5500, 6000, tiers)).toBe(12000)
  })

  it('group size with no tier returns null (unbookable selection)', () => {
    expect(coachPricePence(4, null, 6000, tiers)).toBeNull()
    expect(coachPricePence(2, null, 6000, null)).toBeNull()
  })
})

// ─── holdSecondsRemaining ─────────────────────────────────────────────────────

describe('holdSecondsRemaining', () => {
  const t0 = 1_755_000_000_000 // fixed epoch ms anchor

  it('starts at the full 10 minutes', () => {
    expect(HOLD_DURATION_SECONDS).toBe(600)
    expect(holdSecondsRemaining(t0, t0)).toBe(600)
  })

  it('counts down by elapsed whole seconds', () => {
    expect(holdSecondsRemaining(t0, t0 + 13_000)).toBe(587)
    expect(holdSecondsRemaining(t0, t0 + 13_999)).toBe(587)
  })

  it('clamps at zero once expired', () => {
    expect(holdSecondsRemaining(t0, t0 + 600_000)).toBe(0)
    expect(holdSecondsRemaining(t0, t0 + 3_600_000)).toBe(0)
  })

  it('a clock skewed before the hold start still shows the full window', () => {
    expect(holdSecondsRemaining(t0, t0 - 5_000)).toBe(600)
  })
})

// ─── formatHoldClock ──────────────────────────────────────────────────────────

describe('formatHoldClock', () => {
  it('formats m:ss with zero-padded seconds', () => {
    expect(formatHoldClock(600)).toBe('10:00')
    expect(formatHoldClock(587)).toBe('9:47')
    expect(formatHoldClock(61)).toBe('1:01')
    expect(formatHoldClock(0)).toBe('0:00')
  })
})

// ─── formatPricePence ─────────────────────────────────────────────────────────

describe('formatPricePence', () => {
  it('drops the decimals for whole pounds', () => {
    expect(formatPricePence(6000)).toBe('£60')
    expect(formatPricePence(15000)).toBe('£150')
  })

  it('keeps two decimals for non-whole pounds (BR-10 pence precision)', () => {
    expect(formatPricePence(4550)).toBe('£45.50')
    expect(formatPricePence(6601)).toBe('£66.01')
  })
})
